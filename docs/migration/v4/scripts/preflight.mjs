import { createHash } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createReadOnlyClient } from "./lib/pg-readonly.mjs";
import { runPreflight } from "./lib/preflight-engine.mjs";
import { loadPrismaCatalog } from "./lib/prisma-catalog.mjs";
import { assertNoSensitiveSerializedContent, assertNoSensitiveValues } from "./lib/sensitivity.mjs";
import { serializeStableJson, writeFileSetAtomically } from "./lib/stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const MAX_JSON_FILE_SIZE = 32 * 1024 * 1024;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_KEYS = 200_000;
const MAX_JSON_NODES = 500_000;
const MAX_JSON_STRING_LENGTH = 1024 * 1024;
const OUTPUT_RELATIVE_PATH = path.join("reports", "supabase-preflight.json");
const REPOSITORY_PRISMA_PATH = fileURLToPath(
  new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
);
const PACKAGE_FILES = Object.freeze({
  columnMappings: path.join("mapping", "columns.json"),
  destinationMappings: path.join("mapping", "destinations.json"),
  pendingTables: path.join("pending-mapping", "tables.json"),
  quarantineSummary: path.join("quarantine", "summary.json"),
  sourceInventory: path.join("reports", "source-inventory.json"),
  tableMappings: path.join("mapping", "tables.json"),
});

export async function runCli({
  args = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  createClient = createReadOnlyClient,
  executePreflight = runPreflight,
  expectedPrismaPath = REPOSITORY_PRISMA_PATH,
  inspectSerializedContent = assertNoSensitiveSerializedContent,
  loadCatalog = loadPrismaCatalog,
  writePackage = writeFileSetAtomically,
} = {}) {
  try {
    const options = parseCommandLine(args);
    const packageDirectory = await assertRealDirectory(options.package, "Package V4 inválido.");
    const prismaPath = await assertAllowedPrismaPath(options.prisma, expectedPrismaPath);
    const outputPath = await assertSafeOutputPath(packageDirectory);
    const mappingPackage = await loadMappingPackage(packageDirectory, inspectSerializedContent);
    const prismaCatalog = await loadCatalog(prismaPath);
    const databaseUrl = selectDatabaseUrl(env);
    const requiredSecretNames = deriveConfigurationChecks(mappingPackage, env);
    const client = await createClient({ databaseUrl });
    const report = await executePreflight({
      client,
      mappingPackage,
      prismaCatalog,
      organizationId: options.organizationId,
      requiredSecretNames,
    });
    assertNoSensitiveValues(report);
    inspectSerializedContent(serializeStableJson(report));
    await assertSafeOutputPath(packageDirectory);
    await writePackage(
      packageDirectory,
      new Map([[OUTPUT_RELATIVE_PATH, serializeStableJson(report)]]),
    );
    await assertRealFile(outputPath, packageDirectory, "Relatório de preflight inválido.");
    stdout.write(
      `Preflight V4 concluído: readyForMigration=${String(report.readyForMigration)}.\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(
      `${error instanceof CliError ? error.message : "Falha técnica no preflight V4 somente leitura."}\n`,
    );
    return 1;
  }
}

function parseCommandLine(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        package: { type: "string" },
        prisma: { type: "string" },
        "organization-id": { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new CliError("Argumentos inválidos para o preflight V4.");
  }
  if (!values.package || !values.prisma || !values["organization-id"]) {
    throw new CliError("Argumentos obrigatórios ausentes no preflight V4.");
  }
  if (values["organization-id"] !== CASTELO_ORGANIZATION_ID) {
    throw new CliError("organization-id deve identificar a Castelo Contabilidade nesta V4.");
  }
  return {
    organizationId: values["organization-id"],
    package: values.package,
    prisma: values.prisma,
  };
}

async function loadMappingPackage(packageDirectory, inspectSerializedContent) {
  const entries = await Promise.all(
    Object.entries(PACKAGE_FILES).map(async ([field, relativePath]) => [
      field,
      await readSafeJson(
        path.join(packageDirectory, relativePath),
        packageDirectory,
        inspectSerializedContent,
      ),
    ]),
  );
  const artifacts = Object.fromEntries(entries);
  validatePackageCoverage(artifacts);
  const evidenceRegistry = new Map();
  for (const table of artifacts.tableMappings) {
    const evidence = table?.evidence;
    evidenceRegistry.set(table?.sourceTable, {
      sourceTable: table?.sourceTable,
      legacyModule: "mapping-package",
      legacyReferences: Array.isArray(evidence?.legacy) ? evidence.legacy : [],
      operations: [],
      legacyRelationships: [],
      currentContractEvidence: Array.isArray(evidence?.current) ? evidence.current : [],
      finalStatus: "confirmed",
      reasonCode: table?.reasonCode,
      reason: table?.reason,
      confidence: "high",
      ruleId: table?.ruleOrigin ?? null,
    });
  }
  for (const pending of artifacts.pendingTables) {
    evidenceRegistry.set(pending?.sourceTable, pending?.evidence);
  }
  const mappingPackage = {
    ...artifacts,
    evidenceRegistry,
    preflightInputs: {},
  };
  assertNoSensitiveValues(mappingPackage);
  return mappingPackage;
}

async function readSafeJson(filePath, packageDirectory, inspectSerializedContent) {
  const canonicalPath = await assertRealFile(filePath, packageDirectory, "Artefato V4 inválido.");
  let handle;
  try {
    handle = await open(
      canonicalPath,
      fileSystemConstants.O_RDONLY | fileSystemConstants.O_NOFOLLOW,
    );
  } catch {
    throw new CliError("Artefato V4 inválido.");
  }
  let bytes;
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new CliError("Artefato V4 inválido.");
    if (before.size > MAX_JSON_FILE_SIZE) {
      throw new CliError("Artefato V4 excede o limite seguro.");
    }
    if ((await realpath(filePath)) !== canonicalPath) {
      throw new CliError("Artefato V4 inválido.");
    }
    bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      bytes.length !== before.size ||
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      (await realpath(filePath)) !== canonicalPath
    ) {
      throw new CliError("Artefato V4 foi alterado durante a leitura.");
    }
  } finally {
    await handle.close();
  }
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError("Artefato V4 não possui UTF-8 válido.");
  }
  try {
    const value = JSON.parse(content);
    validateJsonStructure(value);
    inspectSerializedContent(content);
    return value;
  } catch {
    throw new CliError("Artefato JSON V4 inválido.");
  }
}

function validateJsonStructure(root) {
  const stack = [{ depth: 0, value: root }];
  let keyCount = 0;
  let nodeCount = 0;
  while (stack.length > 0) {
    const { depth, value } = stack.pop();
    nodeCount += 1;
    if (nodeCount > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      throw new CliError("Estrutura JSON V4 excede o limite seguro.");
    }
    if (typeof value === "string") {
      if (value.length > MAX_JSON_STRING_LENGTH) {
        throw new CliError("String JSON V4 excede o limite seguro.");
      }
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    const keys = Object.keys(value);
    keyCount += keys.length;
    if (keyCount > MAX_JSON_KEYS) {
      throw new CliError("Estrutura JSON V4 possui chaves demais.");
    }
    for (const key of keys) {
      if (key.length > MAX_JSON_STRING_LENGTH) {
        throw new CliError("Chave JSON V4 excede o limite seguro.");
      }
      stack.push({ depth: depth + 1, value: value[key] });
    }
  }
}

function validatePackageCoverage({
  destinationMappings,
  pendingTables,
  sourceInventory,
  tableMappings,
}) {
  if (
    !Array.isArray(destinationMappings) ||
    !Array.isArray(pendingTables) ||
    !Array.isArray(tableMappings) ||
    !isPlainObject(sourceInventory) ||
    !Array.isArray(sourceInventory.tables)
  ) {
    throw new CliError("Cobertura do pacote V4 inválida.");
  }
  if (
    sourceInventory.sourceDirectoryLabel !== "03.08.2026" ||
    sourceInventory.expectedTableCount !== 312 ||
    sourceInventory.actualTableCount !== 312 ||
    sourceInventory.tables.length !== 312
  ) {
    throw new CliError("Inventário de origem V4 inválido.");
  }

  const inventoryBySource = new Map();
  const normalizedSources = new Set();
  for (const table of sourceInventory.tables) {
    validateInventoryTable(table);
    const normalized = table.sourceTable.toLowerCase();
    if (normalizedSources.has(normalized)) {
      throw new CliError("Inventário de origem V4 possui sourceTable duplicada.");
    }
    normalizedSources.add(normalized);
    inventoryBySource.set(table.sourceTable, table);
  }
  if (!isSha256(sourceInventory.sourceDigest)) {
    throw new CliError("Digest do inventário V4 inválido.");
  }
  if (sourceInventory.sourceDigest !== createSourceDigest(sourceInventory.tables)) {
    throw new CliError("Digest do inventário V4 diverge das origens.");
  }

  const classifications = new Map();
  for (const mapping of tableMappings) {
    validateClassification(mapping, "confirmed");
    addClassification(classifications, mapping);
  }
  for (const mapping of pendingTables) {
    validateClassification(mapping, "pending");
    addClassification(classifications, mapping);
  }
  if (classifications.size === 0 || classifications.size !== inventoryBySource.size) {
    throw new CliError("Classificação V4 não cobre exatamente o inventário.");
  }
  for (const [sourceTable, inventoryTable] of inventoryBySource) {
    const classification = classifications.get(sourceTable);
    if (classification === undefined || classification.sourceRowCount !== inventoryTable.rowCount) {
      throw new CliError("sourceRowCount V4 diverge do inventário.");
    }
  }

  const destinationsBySource = new Map();
  for (const step of destinationMappings) {
    if (!isPlainObject(step) || typeof step.sourceTable !== "string") {
      throw new CliError("Destination step V4 inválido.");
    }
    const classification = classifications.get(step.sourceTable);
    if (classification === undefined || classification.status !== "confirmed") {
      throw new CliError("Pending não pode possuir destination step.");
    }
    validateDestinationFinalStates(step, classification.sourceRowCount);
    const steps = destinationsBySource.get(step.sourceTable) ?? [];
    steps.push(step);
    destinationsBySource.set(step.sourceTable, steps);
  }
  for (const mapping of tableMappings) {
    if ((destinationsBySource.get(mapping.sourceTable) ?? []).length === 0) {
      throw new CliError("Origem confirmed sem destination step.");
    }
  }
}

function validateInventoryTable(table) {
  if (
    !isPlainObject(table) ||
    typeof table.sourceTable !== "string" ||
    table.sourceTable.length === 0 ||
    table.sourceTable.length > 256 ||
    !isSha256(table.sha256)
  ) {
    throw new CliError("Entrada do inventário V4 inválida.");
  }
  for (const field of ["fileSizeBytes", "insertStatementCount", "rowCount"]) {
    if (!isSafeCount(table[field])) {
      throw new CliError("Contagem do inventário V4 inválida.");
    }
  }
}

function validateClassification(mapping, status) {
  if (
    !isPlainObject(mapping) ||
    mapping.status !== status ||
    typeof mapping.sourceTable !== "string" ||
    mapping.sourceTable.length === 0 ||
    !isSafeCount(mapping.sourceRowCount)
  ) {
    throw new CliError("Estado final de origem V4 inválido.");
  }
}

function addClassification(classifications, mapping) {
  if (classifications.has(mapping.sourceTable)) {
    throw new CliError("Origem V4 possui mais de um estado final.");
  }
  classifications.set(mapping.sourceTable, mapping);
}

function validateDestinationFinalStates(step, sourceRowCount) {
  if (!isSafeCount(step.readRows) || step.readRows !== sourceRowCount) {
    throw new CliError("Destination step V4 possui leitura incompleta.");
  }
  const counts = [step.prepared, step.quarantine, step.notEmitted, step.blockedRows];
  if (
    !counts.every(isSafeCount) ||
    counts.reduce((sum, value) => sum + value, 0) !== sourceRowCount
  ) {
    throw new CliError("Destination step V4 não possui estado final completo.");
  }
}

function createSourceDigest(tables) {
  const canonical = [...tables]
    .sort((left, right) => compareText(left.sourceTable, right.sourceTable))
    .map(({ rowCount, sha256, sourceTable }) => `${sourceTable}\t${sha256}\t${rowCount}`)
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isSafeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value) {
  return (
    value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  );
}

function deriveConfigurationChecks(mappingPackage, env) {
  const names = new Set();
  for (const step of mappingPackage.destinationMappings) {
    const transformations = (step.columns ?? [])
      .map(({ transformation }) => transformation)
      .filter((value) => typeof value === "string");
    const encryptionRequired = transformations.some((value) => /encrypt|credential/i.test(value));
    if (/^certificate\.(?:pf|pj)$/.test(step.destinationTable)) {
      names.add("CERTIFICATE_FILE_ENCRYPTION_KEY");
      names.add("CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION");
    } else if (step.destinationTable === "pessoal.passwords" && encryptionRequired) {
      names.add("PESSOAL_PASSWORD_ENCRYPTION_KEY");
      names.add("PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION");
    } else if (encryptionRequired) {
      names.add("MTK_ENCRYPTION_KEY");
    }
  }
  return [...names]
    .sort(compareText)
    .map((name) => ({ configured: hasEnvironmentValue(env, name), name }));
}

function selectDatabaseUrl(env) {
  const databaseUrl = hasEnvironmentValue(env, "DATABASE_URL")
    ? env.DATABASE_URL
    : hasEnvironmentValue(env, "DIRECT_URL")
      ? env.DIRECT_URL
      : null;
  if (databaseUrl === null) {
    throw new CliError("Conexão PostgreSQL não configurada para o preflight V4.");
  }
  return databaseUrl;
}

async function assertAllowedPrismaPath(requestedPath, expectedPath) {
  const canonicalExpected = await assertRealFile(
    expectedPath,
    null,
    "Schema Prisma permitido indisponível.",
  );
  const canonicalRequested = await assertRealFile(requestedPath, null, "Schema Prisma inválido.");
  if (canonicalRequested !== canonicalExpected) {
    throw new CliError("Schema Prisma deve ser infra/prisma/schema.prisma deste repositório.");
  }
  return canonicalRequested;
}

async function assertSafeOutputPath(packageDirectory) {
  const reportsDirectory = path.join(packageDirectory, "reports");
  try {
    const inspection = await lstat(reportsDirectory);
    if (!inspection.isDirectory() || inspection.isSymbolicLink()) {
      throw new CliError("Diretório de relatório V4 inválido.");
    }
    const canonical = await realpath(reportsDirectory);
    if (canonical !== reportsDirectory || !isWithin(packageDirectory, canonical)) {
      throw new CliError("Diretório de relatório V4 inválido.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const outputPath = path.join(packageDirectory, OUTPUT_RELATIVE_PATH);
  try {
    const inspection = await lstat(outputPath);
    if (!inspection.isFile() || inspection.isSymbolicLink()) {
      throw new CliError("Relatório de preflight V4 inválido.");
    }
    const canonical = await realpath(outputPath);
    if (canonical !== outputPath || !isWithin(packageDirectory, canonical)) {
      throw new CliError("Relatório de preflight V4 inválido.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return outputPath;
}

async function assertRealDirectory(value, message) {
  if (typeof value !== "string" || value.length === 0) throw new CliError(message);
  const resolved = path.resolve(value);
  try {
    const inspection = await lstat(resolved);
    if (!inspection.isDirectory() || inspection.isSymbolicLink()) throw new CliError(message);
    const canonical = await realpath(resolved);
    if (canonical !== resolved) throw new CliError(message);
    return canonical;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(message);
  }
}

async function assertRealFile(value, parentDirectory, message) {
  if (typeof value !== "string" || value.length === 0) throw new CliError(message);
  const resolved = path.resolve(value);
  try {
    const inspection = await lstat(resolved);
    if (!inspection.isFile() || inspection.isSymbolicLink()) throw new CliError(message);
    const canonical = await realpath(resolved);
    if (
      canonical !== resolved ||
      (parentDirectory !== null && !isWithin(parentDirectory, canonical))
    ) {
      throw new CliError(message);
    }
    return canonical;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(message);
  }
}

function hasEnvironmentValue(env, name) {
  return typeof env?.[name] === "string" && env[name].length > 0;
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

class CliError extends Error {}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli();
}

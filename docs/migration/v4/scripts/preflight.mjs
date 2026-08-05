import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createReadOnlyClient } from "./lib/pg-readonly.mjs";
import { runPreflight } from "./lib/preflight-engine.mjs";
import { loadPrismaCatalog } from "./lib/prisma-catalog.mjs";
import { assertNoSensitiveSerializedContent, assertNoSensitiveValues } from "./lib/sensitivity.mjs";
import { serializeStableJson, writeStableJson } from "./lib/stable-output.mjs";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const MAX_JSON_FILE_SIZE = 32 * 1024 * 1024;
const OUTPUT_RELATIVE_PATH = path.join("reports", "supabase-preflight.json");
const PACKAGE_FILES = Object.freeze({
  columnMappings: path.join("mapping", "columns.json"),
  destinationMappings: path.join("mapping", "destinations.json"),
  pendingTables: path.join("pending-mapping", "tables.json"),
  quarantineSummary: path.join("quarantine", "summary.json"),
  tableMappings: path.join("mapping", "tables.json"),
});

export async function runCli({
  args = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  createClient = createReadOnlyClient,
  executePreflight = runPreflight,
  loadCatalog = loadPrismaCatalog,
  writeReport = writeStableJson,
} = {}) {
  try {
    const options = parseCommandLine(args);
    const packageDirectory = await assertRealDirectory(options.package, "Package V4 inválido.");
    const prismaPath = await assertRealFile(options.prisma, null, "Schema Prisma inválido.");
    const outputPath = await assertSafeOutputPath(packageDirectory);
    const mappingPackage = await loadMappingPackage(packageDirectory);
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
    assertNoSensitiveSerializedContent(serializeStableJson(report));
    await assertSafeOutputPath(packageDirectory);
    await writeReport(outputPath, report);
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

async function loadMappingPackage(packageDirectory) {
  const entries = await Promise.all(
    Object.entries(PACKAGE_FILES).map(async ([field, relativePath]) => [
      field,
      await readSafeJson(path.join(packageDirectory, relativePath), packageDirectory),
    ]),
  );
  const artifacts = Object.fromEntries(entries);
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

async function readSafeJson(filePath, packageDirectory) {
  const canonicalPath = await assertRealFile(filePath, packageDirectory, "Artefato V4 inválido.");
  const inspection = await lstat(canonicalPath);
  if (inspection.size > MAX_JSON_FILE_SIZE) {
    throw new CliError("Artefato V4 excede o limite seguro.");
  }
  const bytes = await readFile(canonicalPath);
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError("Artefato V4 não possui UTF-8 válido.");
  }
  assertNoSensitiveSerializedContent(content);
  try {
    return JSON.parse(content);
  } catch {
    throw new CliError("Artefato JSON V4 inválido.");
  }
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

import { writeSync } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { EVIDENCE_REGISTRY } from "./evidence/index.mjs";
import {
  assertSafePackagePath,
  buildMapping,
  createConservativeMappingContextProvider,
  writeMappingPackage,
} from "./lib/mapping-engine.mjs";
import {
  comparePreviousMappings,
  loadPreviousMappingArtifacts,
} from "./lib/previous-comparison.mjs";
import { loadPrismaCatalog } from "./lib/prisma-catalog.mjs";
import { assertNoSensitiveSerializedContent } from "./lib/sensitivity.mjs";
import { buildSourceInventory } from "./lib/source-inventory.mjs";
import { serializeStableJson, writeStableJson } from "./lib/stable-output.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildRuleRegistry,
  CERTIFICATE_RULES,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
} from "./rules/index.mjs";

const USAGE = `Uso:
  node docs/migration/v4/scripts/build-mapping.mjs \\
    --source <diretorio-dos-dumps> \\
    --legacy-source <workspace-legado> \\
    --package <diretorio-de-saida> \\
    --prisma <schema.prisma> \\
    --expected-tables <quantidade> \\
    [--previous-source <backup-historico>]... \\
    [--previous-docs <docs/migration>]
`;

async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    writeSync(process.stdout.fd, USAGE);
    return;
  }
  const options = parseCommandLine();
  await assertLegacyWorkspace(options.legacySource);
  const historicalInputs = await loadHistoricalInputs(options);
  const protectedPaths = [
    options.source,
    options.legacySource,
    options.prisma,
    ...historicalInputs.protectedPaths,
  ];
  try {
    await assertSafePackagePath({ packageDir: options.package, protectedPaths });
  } catch {
    throw new CliError(
      "Package inválido: deve ficar fora das origens e não pode usar symlink/alias.",
    );
  }
  const [inventory, prismaCatalog] = await Promise.all([
    buildSourceInventory({
      sourceDir: options.source,
      expectedTables: options.expectedTables,
    }),
    loadPrismaCatalog(options.prisma),
  ]);
  const ruleRegistry = buildRuleRegistry(
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
    REMAINING_RULES,
  );
  const contextProvider = createConservativeMappingContextProvider({ inventory, ruleRegistry });
  const result = await buildMapping({
    inventory,
    evidenceRegistry: EVIDENCE_REGISTRY,
    ruleRegistry,
    prismaCatalog,
    sourceDir: options.source,
    capabilities: contextProvider,
  });
  await writeMappingPackage(options.package, result, { protectedPaths });
  const comparisonReport = buildComparisonReport({
    currentInventory: inventory,
    evidenceRegistry: EVIDENCE_REGISTRY,
    historicalInputs,
    ruleRegistry,
  });
  const serializedComparison = serializeStableJson(comparisonReport);
  assertNoSensitiveSerializedContent(serializedComparison);
  await writeStableJson(
    path.join(options.package, "reports", "previous-mapping-comparison.json"),
    comparisonReport,
  );
}

function parseCommandLine() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        source: { type: "string" },
        "legacy-source": { type: "string" },
        package: { type: "string" },
        prisma: { type: "string" },
        "expected-tables": { type: "string" },
        "previous-source": { type: "string", multiple: true },
        "previous-docs": { type: "string" },
      },
      strict: true,
    }));
  } catch {
    throw new CliError("Argumentos inválidos.");
  }
  if (
    !values.source ||
    !values["legacy-source"] ||
    !values.package ||
    !values.prisma ||
    !values["expected-tables"]
  ) {
    throw new CliError("Argumentos obrigatórios ausentes.");
  }
  return {
    source: values.source,
    legacySource: values["legacy-source"],
    package: values.package,
    prisma: values.prisma,
    expectedTables: parsePositiveInteger(values["expected-tables"]),
    previousSources: values["previous-source"] ?? [],
    previousDocs: values["previous-docs"] ?? null,
  };
}

async function loadHistoricalInputs(options) {
  const historicalInventories = [];
  const previousArtifacts = [];
  const protectedPaths = [];
  const issues = [];

  for (const [index, sourceDir] of options.previousSources.entries()) {
    try {
      const canonicalSource = await assertRealDirectory(sourceDir);
      const expectedTables = await countSqlFiles(canonicalSource);
      if (expectedTables === 0) throw new Error("Backup histórico sem dumps SQL");
      const inventory = await buildSourceInventory({
        sourceDir: canonicalSource,
        expectedTables,
      });
      const version = inventory.sourceDirectoryLabel;
      if (historicalInventories.some((entry) => entry.version === version)) {
        throw new Error("Versão histórica duplicada");
      }
      historicalInventories.push({
        version,
        origin: `backup/${version}`,
        digest: inventory.sourceDigest,
        inventory,
      });
      protectedPaths.push(canonicalSource);
    } catch {
      issues.push({
        scope: `previous-source-${index + 1}`,
        reasonCode: "HISTORICAL_SOURCE_UNAVAILABLE",
      });
    }
  }

  if (options.previousDocs !== null) {
    try {
      const canonicalDocs = await assertRealDirectory(options.previousDocs);
      const loaded = await loadPreviousMappingArtifacts({ previousDocsDir: canonicalDocs });
      previousArtifacts.push(...loaded.artifacts);
      issues.push(...loaded.issues);
      protectedPaths.push(canonicalDocs);
    } catch {
      issues.push({
        scope: "previous-docs",
        reasonCode: "PREVIOUS_ARTIFACTS_UNAVAILABLE",
      });
    }
  }

  historicalInventories.sort((left, right) => compareText(left.version, right.version));
  issues.sort((left, right) => compareText(left.scope, right.scope));
  return {
    historicalInventories,
    previousArtifacts,
    protectedPaths,
    issues,
    requested: options.previousSources.length > 0 || options.previousDocs !== null,
  };
}

function buildComparisonReport({
  currentInventory,
  evidenceRegistry,
  historicalInputs,
  ruleRegistry,
}) {
  let comparison;
  let issues = [...historicalInputs.issues];
  try {
    comparison = comparePreviousMappings({
      currentInventory,
      historicalInventories: historicalInputs.historicalInventories,
      evidenceRegistry,
      ruleRegistry,
      previousArtifacts: historicalInputs.previousArtifacts,
    });
  } catch {
    issues = [...issues, { scope: "comparison", reasonCode: "HISTORICAL_COMPARISON_REJECTED" }];
    comparison = comparePreviousMappings({
      currentInventory,
      historicalInventories: [],
      evidenceRegistry,
      ruleRegistry,
      previousArtifacts: [],
    });
  }
  issues.sort((left, right) => compareText(left.scope, right.scope));
  const hasHistoricalData =
    comparison.historicalSources.length > 0 || comparison.artifactSources.length > 0;
  const availability = !historicalInputs.requested
    ? "not_requested"
    : issues.length === 0
      ? "available"
      : hasHistoricalData
        ? "partial"
        : "unavailable";
  return { availability, issues, ...comparison };
}

async function assertRealDirectory(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new TypeError("Diretório histórico inválido");
  }
  const resolved = path.resolve(directory);
  const inspection = await lstat(resolved);
  if (!inspection.isDirectory() || inspection.isSymbolicLink()) {
    throw new Error("Diretório histórico inválido");
  }
  const canonical = await realpath(resolved);
  if (canonical !== resolved) throw new Error("Diretório histórico usa alias");
  return canonical;
}

async function countSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).length;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value)) throw new CliError("Argumentos inválidos.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError("Argumentos inválidos.");
  }
  return parsed;
}

async function assertLegacyWorkspace(directory) {
  if (!(await isRealEntry(directory, "directory"))) {
    throw new CliError("Workspace legado inválido: marcadores do sistema legado ausentes.");
  }
  for (const marker of ["composer.json", "login.php", "classes/Painel.php"]) {
    if (!(await isRealEntry(path.join(directory, marker), "file"))) {
      throw new CliError("Workspace legado inválido: marcadores do sistema legado ausentes.");
    }
  }
}

async function isRealEntry(target, expectedKind) {
  try {
    const inspection = await lstat(target);
    return (
      !inspection.isSymbolicLink() &&
      (expectedKind === "directory" ? inspection.isDirectory() : inspection.isFile())
    );
  } catch {
    return false;
  }
}

class CliError extends Error {}

try {
  await main();
} catch (error) {
  const message =
    error instanceof CliError ? error.message : "Falha ao gerar pacote de mapeamento V4.";
  writeSync(process.stderr.fd, `${message}\n`);
  process.exitCode = 1;
}

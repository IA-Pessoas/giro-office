#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  parseExcludedDomains,
  partitionMappingsByPolicy,
  resolveMigrationSourceDir,
} from "./lib/exclude-scope.mjs";
import { CASTELO_ORGANIZATION_ID } from "./lib/mapping-contract.mjs";
import { runMigration } from "./lib/migration-runner.mjs";
import { createReadOnlyClient, withReadOnlyTransaction } from "./lib/pg-readonly.mjs";
import {
  createCryptoCapabilities,
  createRuntimeOptionsFromRows,
  loadRuntimeSourceRows,
} from "./lib/runtime-options.mjs";

const DEFAULT_SOURCE_DIR = "/home/bruno/Documents/03.08.2026";
const EXPECTED_SOURCE_TABLES = 312;
const DEFAULT_DEPENDENCIES = Object.freeze({
  buildMigrationInputs,
  createReadOnlyClient,
  createRuntimeOptions: ({ env }) => createCryptoCapabilities(env),
  createMutableClient,
  createPostgresClient,
  executeDryRun,
  loadArtifactBinding,
  now: () => new Date(),
  prepareMigration,
  readJson: readJsonFile,
  runDryRun: runProductionDryRun,
  withReadOnlyTransaction,
});

export async function runCli({ argv = [], env = process.env, dependencies = {} } = {}) {
  const runtime = { ...DEFAULT_DEPENDENCIES, runMigration, ...dependencies };
  const options = parseArguments(argv);
  options.fastMode = isFastModeEnabled(env, options.fastMode);
  const runtimeOptions = runtime.createRuntimeOptions({ env });
  const allowPartialApply = options.allowPartial || isPartialApplyEnabled(env);
  if (!options.apply) {
    const [report, artifactBinding] = await Promise.all([
      runtime.runDryRun({
        createReadOnlyClient: runtime.createReadOnlyClient,
        env,
        executeDryRun: runtime.executeDryRun,
        fastMode: options.fastMode,
        runtimeOptions,
        withReadOnlyTransaction: runtime.withReadOnlyTransaction,
      }),
      runtime.loadArtifactBinding(),
    ]);
    return Object.freeze({
      schemaVersion: "giro-office.migration-v4.dry-run/1",
      ...report,
      ...artifactBinding,
      complete: report.complete === true && typeof env.MIGRATION_DATABASE_IDENTITY === "string",
      createdAt: runtime.now().toISOString(),
      databaseIdentity: env.MIGRATION_DATABASE_IDENTITY ?? null,
      mode: "dry-run",
      organizationId: CASTELO_ORGANIZATION_ID,
      writesPerformed: false,
    });
  }

  assertApplyArguments(options, env);
  let dryRunReport;
  let snapshotManifest;
  let artifactBinding;
  try {
    [dryRunReport, snapshotManifest, artifactBinding] = await Promise.all([
      runtime.readJson(options.dryRunReportPath),
      runtime.readJson(options.snapshotManifestPath),
      runtime.loadArtifactBinding(),
    ]);
  } catch {
    throw applyGuardError();
  }
  if (
    !isAcceptedApplyArtifact(dryRunReport, snapshotManifest, artifactBinding, runtime.now(), {
      allowPartial: allowPartialApply,
    })
  ) {
    throw applyGuardError();
  }

  const client = await runtime.createMutableClient(env.MIGRATION_DATABASE_URL, {
    createPostgresClient: runtime.createPostgresClient,
  });
  try {
    const prepared = await runtime.prepareMigration({
      buildMigrationInputs: runtime.buildMigrationInputs,
      client,
      env,
      organizationId: options.tenant,
      readJson: runtime.readJson,
      runtimeOptions,
    });
    return await runtime.runMigration({
      client,
      // A escrita parcial deve ser idempotente sobre o mock já existente:
      // merges sem pai no destino são ignorados e inserts repetidos não
      // abortam a transação. Referências obrigatórias já foram classificadas
      // no dry-run e permanecem em quarentena quando não resolvidas.
      plan: {
        ...prepared.plan,
        skipDuplicateInserts: true,
        skipMissingMergeTargets: true,
        skipEmptyCleanup: true,
        skipUnresolvedForeignKeys: true,
      },
      executionSession: prepared.executionSession,
      allowPartial: allowPartialApply,
      dryRunReport,
      snapshotManifest,
      organizationId: options.tenant,
      batchSize: prepared.batchSize ?? 500,
    });
  } finally {
    await client.end?.();
  }
}

async function runProductionDryRun({
  createReadOnlyClient: createClient,
  env,
  executeDryRun: execute,
  runtimeOptions,
  fastMode = false,
  withReadOnlyTransaction: readOnlyTransaction,
}) {
  const databaseUrl = selectReadOnlyDatabaseUrl(env);
  const reportStep =
    env.MIGRATION_DRY_RUN_PROGRESS === "1"
      ? (stepKey) => process.stderr.write(`dry-run:${stepKey.replace("\0", ":")}\n`)
      : undefined;
  if (databaseUrl === null) return execute({ reportStep, runtimeOptions, fastMode, env });
  const client = await createClient({ databaseUrl });
  return readOnlyTransaction(client, (destinationClient) =>
    execute({ destinationClient, reportStep, runtimeOptions, fastMode, env }),
  );
}

async function createMutableClient(connectionString, { createPostgresClient: createClient }) {
  return createClient(connectionString);
}

async function createPostgresClient(connectionString) {
  const requireFromServices = createRequire(
    new URL("../../../../services/src/package.json", import.meta.url),
  );
  let modulePath;
  try {
    modulePath = requireFromServices.resolve("pg");
  } catch (error) {
    try {
      modulePath = createRequire(import.meta.url).resolve("pg");
    } catch {
      for (const packageUrl of [
        new URL(
          "../../../../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg/package.json",
          import.meta.url,
        ),
        new URL("../../../../../../node_modules/pg/package.json", import.meta.url),
      ]) {
        try {
          modulePath = createRequire(packageUrl).resolve("pg");
          break;
        } catch {}
      }
      if (modulePath === undefined) throw error;
    }
  }
  const pg = await import(pathToFileURL(modulePath).href);
  const Client = pg.Client ?? pg.default?.Client;
  if (typeof Client !== "function") throw new Error("MIGRATION_POSTGRES_CLIENT_UNAVAILABLE");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function prepareMigration(options) {
  return options.buildMigrationInputs(options);
}

async function buildMigrationInputs({
  client,
  organizationId,
  readJson: readArtifact,
  runtimeOptions = {},
}) {
  const [
    { buildConfirmedScope },
    { createExecutionSession },
    { executionStepKey, validateExecutionCoverage },
    { loadPrismaCatalog },
    runtime,
    inventory,
    tableMappings,
    destinationMappings,
  ] = await Promise.all([
    import("./lib/confirmed-scope.mjs"),
    import("./lib/execution-engine.mjs"),
    import("./lib/execution-registry.mjs"),
    import("./lib/prisma-catalog.mjs"),
    import("./runtime/index.mjs"),
    readArtifact(new URL("../reports/source-inventory.json", import.meta.url)),
    readArtifact(new URL("../mapping/tables.json", import.meta.url)),
    readArtifact(new URL("../mapping/destinations.json", import.meta.url)),
  ]);
  const prismaCatalog = await loadPrismaCatalog(
    new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  );
  const confirmedScope = buildConfirmedScope({
    inventory,
    tableMappings,
    destinationMappings,
    sourceDigest: inventory.sourceDigest,
  });
  const executionRegistry = runtime.createCompleteExecutionRegistry();
  const ruleRegistry = new Map(runtime.ALL_MAPPING_RULES.map((rule) => [rule.sourceTable, rule]));
  validateExecutionCoverage({ executionRegistry, prismaCatalog, ruleRegistry });
  const destinationReader = createDestinationReader(client, prismaCatalog, organizationId);
  const [sourceRowsByTable, destinationRowsByTable] = await Promise.all([
    loadRuntimeSourceRows({
      sourceDir: DEFAULT_SOURCE_DIR,
      sourceTables: tableMappings.map(({ sourceTable }) => sourceTable),
    }),
    loadDestinationRowsByTable({ destinationMappings, destinationReader, prismaCatalog }),
  ]);
  const completeRuntimeOptions = createRuntimeOptionsFromRows({
    capabilities: runtimeOptions,
    destinationRowsByTable,
    sourceRowsByTable,
  });
  const createSession = () =>
    createExecutionSession({
      scope: confirmedScope,
      sourceDir: DEFAULT_SOURCE_DIR,
      mappingPackage: { inventory, tableMappings, destinationMappings },
      ruleRegistry,
      executionRegistry,
      runtimeStateByStep: runtime.createCompleteRuntimeStateByStep(completeRuntimeOptions),
      organizationId,
      destinationReader,
      configuration: { batchSize: 500 },
    });
  const cleanupSession = await createSession();
  const executionSession = await createSession();
  const steps = [...executionRegistry].map(([, entry]) => ({
    key: executionStepKey(entry),
    sourceTable: entry.sourceTable,
    stepId: entry.stepId,
    destinationTable: entry.destinationTable,
    dependencies:
      ruleRegistry
        .get(entry.sourceTable)
        ?.destinations.find(({ stepId }) => stepId === entry.stepId)?.dependencies ?? [],
    contract: entry.contract,
  }));
  return Object.freeze({
    batchSize: 500,
    executionSession,
    plan: Object.freeze({ catalog: prismaCatalog, cleanupSession, steps: Object.freeze(steps) }),
  });
}

export function createDestinationReader(client, prismaCatalog, organizationId) {
  return async function* destinationReader(request) {
    if (request?.destinationTable === undefined) return;
    if (request.organizationId !== organizationId) throw new Error("MIGRATION_TENANT_NOT_CASTELO");
    const model = prismaCatalog.models.find(
      ({ databaseName }) => databaseName === request.destinationTable,
    );
    if (model === undefined) throw new Error("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
    const scalarColumns = new Set(
      model.fields
        .filter(({ relationModel }) => relationModel === null || relationModel === undefined)
        .map(({ databaseName }) => databaseName),
    );
    const primaryColumns = model.fields
      .filter(
        ({ id, relationModel }) =>
          id === true && (relationModel === null || relationModel === undefined),
      )
      .map(({ databaseName }) => databaseName)
      .sort();
    if (primaryColumns.length === 0) throw new Error("MIGRATION_DESTINATION_PRIMARY_KEY_MISSING");
    const requestedColumns = Array.isArray(request.columns) ? request.columns : [];
    const columns = [
      ...new Set([...primaryColumns, "organization_id", ...requestedColumns]),
    ].sort();
    if (columns.some((column) => !scalarColumns.has(column))) {
      throw new Error("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
    }
    const batchSize = Math.min(
      Number.isSafeInteger(request.batchSize) ? request.batchSize : 500,
      500,
    );
    const cursorColumn = primaryColumns.length === 1 ? primaryColumns[0] : null;
    let offset = 0;
    let cursor = null;
    for (;;) {
      const cursorClause =
        cursorColumn === null || cursor === null
          ? `"organization_id" = $1`
          : `"organization_id" = $1 AND ${quoteIdentifier(cursorColumn)} > $2`;
      const values =
        cursorColumn === null || cursor === null
          ? [organizationId, batchSize, offset]
          : [organizationId, cursor, batchSize];
      const limitParameter = cursorColumn === null || cursor === null ? "$2" : "$3";
      const offsetClause = cursorColumn === null || cursor === null ? " OFFSET $3" : "";
      const result = await client.query(
        `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(model.databaseName)} WHERE ${cursorClause} ORDER BY ${primaryColumns.map(quoteIdentifier).join(", ")} LIMIT ${limitParameter}${offsetClause}`,
        values,
      );
      if (!Array.isArray(result.rows) || result.rows.length === 0) return;
      yield result.rows;
      if (result.rows.length < batchSize) return;
      if (cursorColumn === null) offset += batchSize;
      else cursor = result.rows[result.rows.length - 1][cursorColumn];
    }
  };
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function executeDryRun({
  destinationClient = null,
  reportStep,
  runtimeOptions = {},
  fastMode = false,
  env = process.env,
} = {}) {
  return buildProductionDryRunReport(runtimeOptions, destinationClient, reportStep, {
    fastMode,
    env,
  });
}

async function buildProductionDryRunReport(
  capabilities,
  destinationClient,
  reportStep,
  options = {},
) {
  const fastMode = options.fastMode === true;
  const sourceDir = resolveMigrationSourceDir(options.env ?? process.env, DEFAULT_SOURCE_DIR);
  const excludedDomains = parseExcludedDomains(options.env?.MIGRATION_EXCLUDE_DOMAINS);
  const { buildSourceInventory } = await import("./lib/source-inventory.mjs");
  const [
    { buildConfirmedScope },
    { runDryRun },
    { createExecutionSession },
    { loadPrismaCatalog },
    runtime,
    tableMappings,
    destinationMappings,
    pendingMappings,
    inventory,
  ] = await Promise.all([
    import("./lib/confirmed-scope.mjs"),
    import("./dry-run.mjs"),
    import("./lib/execution-engine.mjs"),
    import("./lib/prisma-catalog.mjs"),
    import("./runtime/index.mjs"),
    readJsonFile(new URL("../mapping/tables.json", import.meta.url)),
    readJsonFile(new URL("../mapping/destinations.json", import.meta.url)),
    readJsonFile(new URL("../pending-mapping/tables.json", import.meta.url)),
    buildSourceInventory({
      sourceDir,
      expectedTables: EXPECTED_SOURCE_TABLES,
    }),
  ]);
  const partitioned = partitionMappingsByPolicy({
    tableMappings,
    destinationMappings,
    executionRegistry: runtime.createCompleteExecutionRegistry(),
    pendingMappings,
    excludedDomains,
  });
  const confirmedScope = buildConfirmedScope({
    inventory,
    tableMappings: partitioned.tableMappings,
    destinationMappings: partitioned.destinationMappings,
    sourceDigest: inventory.sourceDigest,
  });
  const executionRegistry = partitioned.executionRegistry;
  const ruleRegistry = new Map(runtime.ALL_MAPPING_RULES.map((rule) => [rule.sourceTable, rule]));
  const prismaCatalog = await loadPrismaCatalog(
    new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  );
  const sourceRowsByTable = await loadRuntimeSourceRows({
    sourceDir,
    sourceTables: partitioned.tableMappings.map(({ sourceTable }) => sourceTable),
  });
  const destinationReader =
    destinationClient === null || fastMode
      ? async function* emptyDestinationReader() {}
      : createDestinationReader(destinationClient, prismaCatalog, CASTELO_ORGANIZATION_ID);
  const destinationRowsByTable =
    destinationClient === null || fastMode
      ? new Map()
      : await loadDestinationRowsByTable({
          destinationMappings: partitioned.destinationMappings,
          destinationReader,
          prismaCatalog,
        });
  const runtimeOptions = createRuntimeOptionsFromRows({
    capabilities,
    destinationRowsByTable,
    sourceRowsByTable,
  });
  const createSession = () =>
    createExecutionSession({
      scope: confirmedScope,
      sourceDir,
      mappingPackage: {
        inventory,
        tableMappings: partitioned.tableMappings,
        destinationMappings: partitioned.destinationMappings,
      },
      ruleRegistry,
      executionRegistry,
      runtimeStateByStep: runtime.createCompleteRuntimeStateByStep(runtimeOptions),
      organizationId: CASTELO_ORGANIZATION_ID,
      destinationReader,
    });
  return runDryRun({
    inventory,
    confirmedScope,
    executionRegistry,
    pendingMappings: partitioned.pendingMappings,
    fastMode,
    policyExcludedSources: partitioned.excludedSources,
    createSession,
    reportStep,
  });
}

async function loadDestinationRowsByTable({
  destinationMappings,
  destinationReader,
  prismaCatalog,
}) {
  const rowsByTable = new Map();
  const tables = [
    ...new Set(destinationMappings.map(({ destinationTable }) => destinationTable)),
  ].sort();
  for (const destinationTable of tables) {
    const model = prismaCatalog.models.find(
      ({ databaseName }) => databaseName === destinationTable,
    );
    const columns = model.fields
      .filter(({ relationModel }) => relationModel === null || relationModel === undefined)
      .map(({ databaseName }) => databaseName);
    const rows = [];
    for await (const batch of destinationReader({
      batchSize: 500,
      columns,
      destinationTable,
      organizationId: CASTELO_ORGANIZATION_ID,
    })) {
      rows.push(...batch);
    }
    rowsByTable.set(destinationTable, rows);
  }
  return rowsByTable;
}

function selectReadOnlyDatabaseUrl(env) {
  for (const name of ["MIGRATION_READONLY_DATABASE_URL", "DATABASE_URL", "DIRECT_URL"]) {
    if (typeof env?.[name] === "string" && env[name].trim().length > 0) return env[name];
  }
  return null;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadArtifactBinding() {
  const [{ digestExecutionRegistry }, runtime, inventory, ...contents] = await Promise.all([
    import("./lib/execution-engine.mjs"),
    import("./runtime/index.mjs"),
    readJsonFile(new URL("../reports/source-inventory.json", import.meta.url)),
    readFile(new URL("../mapping/tables.json", import.meta.url), "utf8"),
    readFile(new URL("../mapping/destinations.json", import.meta.url), "utf8"),
    readFile(new URL("../pending-mapping/tables.json", import.meta.url), "utf8"),
    readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  ]);
  const [tables, destinations, pending, manifest] = Object.values(contents);
  return Object.freeze({
    executionDigest: digestExecutionRegistry(runtime.createCompleteExecutionRegistry()),
    manifestDigest: sha256(manifest),
    mappingDigest: sha256(`${tables}\0${destinations}\0${pending}`),
    organizationId: CASTELO_ORGANIZATION_ID,
    sourceDigest: inventory.sourceDigest,
  });
}

function isAcceptedApplyArtifact(report, snapshot, binding, now, options = {}) {
  const reportFields = [
    "blockers",
    "complete",
    "createdAt",
    "databaseIdentity",
    "destinationCounts",
    "executionDigest",
    "expectedWriteCounts",
    "expectedWrites",
    "inventoryCounts",
    "manifestDigest",
    "mappingDigest",
    "mode",
    "organizationId",
    "quarantine",
    "schemaVersion",
    "sourceDigest",
    "sourceCounts",
    "statusCounts",
    "writesPerformed",
  ];
  const snapshotFields = ["createdAt", "databaseIdentity", "restorable", "schemaVersion"];
  if (!hasExactFields(report, reportFields) || !hasExactFields(snapshot, snapshotFields))
    return false;
  if (
    report.schemaVersion !== "giro-office.migration-v4.dry-run/1" ||
    report.mode !== "dry-run" ||
    report.writesPerformed !== false ||
    report.organizationId !== CASTELO_ORGANIZATION_ID ||
    snapshot.schemaVersion !== "giro-office.migration-v4.snapshot/1" ||
    snapshot.restorable !== true ||
    snapshot.databaseIdentity !== report.databaseIdentity ||
    !/^sha256:[a-f0-9]{64}$/.test(report.databaseIdentity)
  ) {
    return false;
  }
  if (options?.allowPartial !== true && report.complete !== true) return false;
  if (
    !hasExactFields(report.inventoryCounts, [
      "executableSources",
      "pendingSources",
      "rows",
      "sources",
      "steps",
    ]) ||
    report.inventoryCounts.sources !== 312 ||
    report.inventoryCounts.rows !== 1_374_880 ||
    report.inventoryCounts.executableSources !== 103 ||
    report.inventoryCounts.steps !== 133 ||
    report.inventoryCounts.pendingSources !== 209 ||
    !hasExactFields(report.blockers, [
      "quarantine",
      "unclassifiedSources",
      "unresolvedRequiredReferences",
    ]) ||
    Object.values(report.blockers).some((value) => typeof value !== "number" || value < 0) ||
    (options?.allowPartial !== true && Object.values(report.blockers).some((value) => value !== 0))
  ) {
    return false;
  }
  if (!hasValidApplyMetrics(report, options)) return false;
  for (const field of ["executionDigest", "manifestDigest", "mappingDigest", "sourceDigest"]) {
    if (!/^[a-f0-9]{64}$/.test(report[field]) || report[field] !== binding?.[field]) return false;
  }
  if (binding?.organizationId !== CASTELO_ORGANIZATION_ID) return false;
  const reportTime = Date.parse(report.createdAt);
  const snapshotTime = Date.parse(snapshot.createdAt);
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  return (
    Number.isFinite(reportTime) &&
    Number.isFinite(snapshotTime) &&
    Number.isFinite(nowTime) &&
    snapshotTime <= reportTime &&
    reportTime <= nowTime &&
    nowTime - reportTime <= 30 * 60 * 1000 &&
    reportTime - snapshotTime <= 24 * 60 * 60 * 1000
  );
}

function hasValidApplyMetrics(report, options = {}) {
  const allowPartial = options?.allowPartial === true;
  const countFields = ["notEmitted", "prepared", "quarantine"];
  if (
    !hasNaturalNumberFields(report.sourceCounts, countFields) ||
    !hasNaturalNumberFields(report.statusCounts, countFields) ||
    !hasNaturalNumberFields(report.expectedWriteCounts, ["aggregate", "insert", "update"]) ||
    !Number.isSafeInteger(report.expectedWrites) ||
    report.expectedWrites < 0 ||
    !Array.isArray(report.quarantine) ||
    (allowPartial !== true && report.quarantine.length !== 0) ||
    report.sourceCounts.notEmitted +
      report.sourceCounts.prepared +
      report.sourceCounts.quarantine !==
      report.inventoryCounts.rows ||
    (allowPartial !== true && report.sourceCounts.quarantine !== 0) ||
    report.sourceCounts.notEmitted > report.statusCounts.notEmitted ||
    report.sourceCounts.prepared > report.statusCounts.prepared ||
    report.statusCounts.quarantine !== report.blockers.quarantine ||
    report.expectedWriteCounts.aggregate +
      report.expectedWriteCounts.insert +
      report.expectedWriteCounts.update !==
      report.expectedWrites ||
    report.destinationCounts === null ||
    typeof report.destinationCounts !== "object" ||
    Array.isArray(report.destinationCounts)
  ) {
    return false;
  }

  const destinationTotals = { notEmitted: 0, prepared: 0, quarantine: 0 };
  for (const [destination, counts] of Object.entries(report.destinationCounts)) {
    if (destination.length === 0 || !hasNaturalNumberFields(counts, countFields)) return false;
    for (const field of countFields) destinationTotals[field] += counts[field];
  }
  return (
    Number.isSafeInteger(destinationTotals.notEmitted) &&
    Number.isSafeInteger(destinationTotals.prepared) &&
    Number.isSafeInteger(destinationTotals.quarantine) &&
    destinationTotals.notEmitted <= report.statusCounts.notEmitted &&
    destinationTotals.prepared <= report.statusCounts.prepared &&
    destinationTotals.quarantine <= report.statusCounts.quarantine &&
    report.expectedWrites <= destinationTotals.prepared
  );
}

function hasNaturalNumberFields(value, fields) {
  return (
    hasExactFields(value, fields) &&
    Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0)
  );
}

function hasExactFields(value, fields) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...fields].sort().join("\0")
  );
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw applyGuardError();
  const options = {
    apply: false,
    allowPartial: false,
    tenant: null,
    dryRunReportPath: null,
    snapshotManifestPath: null,
    fastMode: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--fast" && options.fastMode === false) {
      options.fastMode = true;
      continue;
    }
    if (argument === "--apply" && options.apply === false) {
      options.apply = true;
      continue;
    }
    if (argument === "--allow-partial" && options.allowPartial === false) {
      options.allowPartial = true;
      continue;
    }
    const field = {
      "--tenant": "tenant",
      "--dry-run-report": "dryRunReportPath",
      "--snapshot-manifest": "snapshotManifestPath",
    }[argument];
    if (field === undefined || options[field] !== null || argv[index + 1] === undefined) {
      throw applyGuardError();
    }
    options[field] = argv[index + 1];
    index += 1;
  }
  return options;
}

function isPartialApplyEnabled(env = {}) {
  if (typeof env?.MIGRATION_ALLOW_PARTIAL_APPLY !== "string") return false;
  const value = env.MIGRATION_ALLOW_PARTIAL_APPLY.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isFastModeEnabled(env, fastMode = false) {
  return (
    fastMode === true ||
    (typeof env?.MIGRATION_FAST_MODE === "string" &&
      (env.MIGRATION_FAST_MODE === "1" || env.MIGRATION_FAST_MODE.toLowerCase() === "true"))
  );
}

function assertApplyArguments(options, env) {
  if (
    options.fastMode === true ||
    options.tenant !== CASTELO_ORGANIZATION_ID ||
    options.dryRunReportPath === null ||
    options.snapshotManifestPath === null ||
    typeof env?.MIGRATION_DATABASE_URL !== "string" ||
    env.MIGRATION_DATABASE_URL.trim().length === 0
  ) {
    throw applyGuardError();
  }
}

function applyGuardError() {
  const error = new Error("MIGRATION_APPLY_GUARD_FAILED");
  error.code = "MIGRATION_APPLY_GUARD_FAILED";
  return error;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    const result = await runCli({ argv: process.argv.slice(2) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "MIGRATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}

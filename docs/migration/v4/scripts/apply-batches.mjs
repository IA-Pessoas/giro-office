#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { chunkSources, filterPlanSteps, orderSourcesForApply } from "./lib/apply-batch.mjs";
import { createApplyBatchLogger, serializeMigrationError } from "./lib/apply-batch-log.mjs";
import { CASTELO_ORGANIZATION_ID } from "./lib/mapping-contract.mjs";
import { runMigration } from "./lib/migration-runner.mjs";
import {
  partitionMappingsByPolicy,
  parseExcludedDomains,
  resolveMigrationSourceDir,
} from "./lib/exclude-scope.mjs";
import {
  createCryptoCapabilities,
  createRuntimeOptionsFromRows,
  loadRuntimeSourceRows,
} from "./lib/runtime-options.mjs";

const DEFAULT_SOURCE_DIR = "/home/bruno/Documents/03.08.2026";
const DRY_RUN_REPORT_PATH = new URL(
  "../reports/dry-run-connected-excluded.json",
  import.meta.url,
);
const SNAPSHOT_PATH = new URL("../reports/snapshot-before-apply.json", import.meta.url);
const DEFAULT_LOG_PATH = new URL("../reports/apply-batches.log", import.meta.url);

function selectDatabaseUrl(env) {
  for (const name of ["MIGRATION_DATABASE_URL", "DATABASE_URL", "DIRECT_URL"]) {
    if (typeof env?.[name] === "string" && env[name].trim().length > 0) {
      return env[name].trim();
    }
  }
  return null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function createPostgresClient(connectionString) {
  const requireFromInfra = createRequire(
    new URL("../../../../infra/package.json", import.meta.url),
  );
  const modulePath = requireFromInfra.resolve("pg");
  const pg = await import(pathToFileURL(modulePath).href);
  const Client = pg.Client ?? pg.default?.Client;
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function buildMigrationRuntimePackage({
  client,
  organizationId,
  runtimeOptions,
  env,
  sourceTablesFilter = null,
}) {
  const sourceDir = resolveMigrationSourceDir(env, DEFAULT_SOURCE_DIR);
  const excludedDomains = parseExcludedDomains(env?.MIGRATION_EXCLUDE_DOMAINS);
  const [
    { buildConfirmedScope },
    { createExecutionSession },
    { executionStepKey },
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
    readJson(new URL("../reports/source-inventory.json", import.meta.url)),
    readJson(new URL("../mapping/tables.json", import.meta.url)),
    readJson(new URL("../mapping/destinations.json", import.meta.url)),
  ]);

  const partitioned = partitionMappingsByPolicy({
    tableMappings,
    destinationMappings,
    executionRegistry: runtime.createCompleteExecutionRegistry(),
    pendingMappings: [],
    excludedDomains,
  });

  let activeTableMappings = partitioned.tableMappings;
  if (Array.isArray(sourceTablesFilter)) {
    const allowed = new Set(sourceTablesFilter);
    activeTableMappings = activeTableMappings.filter(({ sourceTable }) =>
      allowed.has(sourceTable),
    );
  }

  const activeDestinationMappings = partitioned.destinationMappings.filter(({ sourceTable }) =>
    activeTableMappings.some((mapping) => mapping.sourceTable === sourceTable),
  );

  const destinationMappingsBySource = new Map();
  for (const mapping of partitioned.destinationMappings) {
    const list = destinationMappingsBySource.get(mapping.sourceTable) ?? [];
    list.push(mapping);
    destinationMappingsBySource.set(mapping.sourceTable, list);
  }
  const contextSourceTables = new Set(activeTableMappings.map(({ sourceTable }) => sourceTable));
  const pendingContextSources = activeDestinationMappings.flatMap(
    ({ dependencies = [] }) => dependencies,
  );
  while (pendingContextSources.length > 0) {
    const sourceTable = pendingContextSources.pop();
    if (contextSourceTables.has(sourceTable)) continue;
    contextSourceTables.add(sourceTable);
    for (const mapping of destinationMappingsBySource.get(sourceTable) ?? []) {
      pendingContextSources.push(...(mapping.dependencies ?? []));
    }
  }

  const executionRegistry = new Map();
  for (const [key, entry] of partitioned.executionRegistry) {
    if (activeTableMappings.some((mapping) => mapping.sourceTable === entry.sourceTable)) {
      executionRegistry.set(key, entry);
    }
  }

  const confirmedScope = buildConfirmedScope({
    inventory,
    tableMappings: activeTableMappings,
    destinationMappings: activeDestinationMappings,
    sourceDigest: inventory.sourceDigest,
  });

  const ruleRegistry = new Map(runtime.ALL_MAPPING_RULES.map((rule) => [rule.sourceTable, rule]));
  const prismaCatalog = await loadPrismaCatalog(
    new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  );

  const destinationReader = createDestinationReader(client, prismaCatalog, organizationId);
  const [sourceRowsByTable, destinationRowsByTable] = await Promise.all([
    loadRuntimeSourceRows({
      sourceDir,
      sourceTables: [...contextSourceTables],
    }),
    loadDestinationRowsByTable({
      destinationMappings: activeDestinationMappings,
      destinationReader,
      prismaCatalog,
    }),
  ]);

  const completeRuntimeOptions = createRuntimeOptionsFromRows({
    capabilities: runtimeOptions,
    destinationRowsByTable,
    sourceRowsByTable,
  });

  const createSession = () =>
    createExecutionSession({
      scope: confirmedScope,
      sourceDir,
      mappingPackage: {
        inventory,
        tableMappings: activeTableMappings,
        destinationMappings: activeDestinationMappings,
      },
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
    plan: Object.freeze({
      catalog: prismaCatalog,
      cleanupSession,
      skipDuplicateInserts: true,
      upsertPermissionMerges: true,
      steps: Object.freeze(steps),
    }),
    tableMappings: activeTableMappings,
  });
}

function createDestinationReader(client, prismaCatalog, organizationId) {
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
    const requestedColumns = Array.isArray(request.columns) ? request.columns : [];
    const columns = [
      ...new Set([...primaryColumns, "organization_id", ...requestedColumns]),
    ].sort();
    const batchSize = Math.min(
      Number.isSafeInteger(request.batchSize) ? request.batchSize : 500,
      500,
    );
    for (let offset = 0; ; offset += batchSize) {
      const result = await client.query(
        `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(model.databaseName)} WHERE "organization_id" = $1 ORDER BY ${primaryColumns.map(quoteIdentifier).join(", ")} LIMIT $2 OFFSET $3`,
        [organizationId, batchSize, offset],
      );
      if (!Array.isArray(result.rows) || result.rows.length === 0) return;
      yield result.rows;
      if (result.rows.length < batchSize) return;
    }
  };
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

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function resolveLogPath(env) {
  const configured = env?.MIGRATION_APPLY_LOG_PATH?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  return DEFAULT_LOG_PATH.pathname;
}

function parseSourceTableFilter(env) {
  const raw = env?.MIGRATION_APPLY_SOURCE_TABLES;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length === 0 ? null : new Set(values);
}

function compactBatchResult(result) {
  const targets = result?.load?.reconciliationTargets;
  if (!Array.isArray(targets) || targets.length <= 10_000) return result;
  return {
    ...result,
    load: {
      ...result.load,
      reconciliationTargets: {
        count: targets.length,
        firstIdentity: targets[0]?.identity ?? null,
        lastIdentity: targets.at(-1)?.identity ?? null,
        omitted: true,
      },
    },
  };
}

async function writeBatchFailureReport(batchIndex, sourceTables, error) {
  const outPath = new URL(
    `../reports/apply-batch-${String(batchIndex).padStart(2, "0")}-error.json`,
    import.meta.url,
  );
  const payload = {
    batchIndex,
    failedAt: new Date().toISOString(),
    sources: sourceTables,
    error: serializeMigrationError(error),
  };
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outPath.pathname;
}

async function main() {
  const env = process.env;
  const logger = createApplyBatchLogger({ logPath: resolveLogPath(env) });
  const databaseUrl = selectDatabaseUrl(env);
  if (databaseUrl === null) {
    throw new Error("MIGRATION_DATABASE_URL ou DATABASE_URL é obrigatório.");
  }

  const chunkSize = Number.parseInt(env.MIGRATION_APPLY_CHUNK_SIZE ?? "6", 10);
  const batchArg = process.argv.find((arg) => arg.startsWith("--batch="));
  const batchIndex = batchArg
    ? Number.parseInt(batchArg.slice("--batch=".length), 10)
    : Number.parseInt(env.MIGRATION_APPLY_BATCH_INDEX ?? "0", 10);
  const runAll = process.argv.includes("--all");
  const sourceTableFilter = parseSourceTableFilter(env);

  const dryRunReport = await readJson(DRY_RUN_REPORT_PATH);
  const snapshotManifest = await readJson(SNAPSHOT_PATH);
  if (
    dryRunReport.databaseIdentity !== snapshotManifest.databaseIdentity ||
    snapshotManifest.restorable !== true
  ) {
    throw new Error("Snapshot ou relatório de dry-run incompatível. Rode prepare-apply-artifacts.");
  }

  await logger.info("start", {
    organizationId: CASTELO_ORGANIZATION_ID,
    chunkSize,
    batchIndex,
    runAll,
    sourceDir: resolveMigrationSourceDir(env, DEFAULT_SOURCE_DIR),
    excludedDomains: parseExcludedDomains(env?.MIGRATION_EXCLUDE_DOMAINS),
    dryRunReportPath: DRY_RUN_REPORT_PATH.pathname,
    snapshotPath: SNAPSHOT_PATH.pathname,
    databaseIdentity: dryRunReport.databaseIdentity,
    expectedWrites: dryRunReport.expectedWrites,
    logPath: resolveLogPath(env),
  });

  const runtimeOptions = createCryptoCapabilities(env);
  const client = await createPostgresClient(databaseUrl);

  try {
    const [tableMappings, destinationMappings, runtime] = await Promise.all([
      readJson(new URL("../mapping/tables.json", import.meta.url)),
      readJson(new URL("../mapping/destinations.json", import.meta.url)),
      import("./runtime/index.mjs"),
    ]);
    const partitioned = partitionMappingsByPolicy({
      tableMappings,
      destinationMappings,
      executionRegistry: runtime.createCompleteExecutionRegistry(),
      pendingMappings: [],
      excludedDomains: parseExcludedDomains(env?.MIGRATION_EXCLUDE_DOMAINS),
    });
    const filteredMappings =
      sourceTableFilter === null
        ? partitioned.tableMappings
        : partitioned.tableMappings.filter(({ sourceTable }) =>
            sourceTableFilter.has(sourceTable),
          );
    const orderedSources = orderSourcesForApply(filteredMappings);
    const batches = chunkSources(orderedSources, chunkSize);
    await logger.info("plan", {
      totalBatches: batches.length,
      chunkSize,
      executableSources: orderedSources.length,
      sourceTableFilter: sourceTableFilter === null ? null : [...sourceTableFilter].sort(),
    });

    const indices = runAll
      ? batches.map((_, index) => index)
      : [batchIndex];

    if (indices.some((index) => index < 0 || index >= batches.length)) {
      throw new Error(`Batch inválido. Use --batch=0..${batches.length - 1}`);
    }

    const results = [];
    for (const index of indices) {
      const sourceTables = batches[index];
      const batchStartedAt = Date.now();
      await logger.phase("batch:start", {
        batchIndex: index,
        batchNumber: index + 1,
        totalBatches: batches.length,
        sourceCount: sourceTables.length,
        sources: sourceTables,
      });

      try {
        await logger.phase("prepare:start", { batchIndex: index });
        const prepareStartedAt = Date.now();
        const prepared = await buildMigrationRuntimePackage({
          client,
          organizationId: CASTELO_ORGANIZATION_ID,
          runtimeOptions,
          env,
          sourceTablesFilter: sourceTables,
        });
        await logger.phase("prepare:done", {
          batchIndex: index,
          durationMs: Date.now() - prepareStartedAt,
          steps: prepared.plan.steps.length,
        });

        const result = await runMigration({
          client,
          plan: {
            ...prepared.plan,
            skipDuplicateInserts: true,
            skipMissingMergeTargets: true,
            skipEmptyCleanup: true,
            skipUnresolvedForeignKeys: true,
          },
          executionSession: prepared.executionSession,
          allowPartial: true,
          partialBatch: true,
          skipCleanup: env.MIGRATION_APPLY_SKIP_CLEANUP === "1",
          batchIndex: index,
          dryRunReport,
          snapshotManifest,
          organizationId: CASTELO_ORGANIZATION_ID,
          batchSize: prepared.batchSize,
        });

        const outPath = new URL(
          `../reports/apply-batch-${String(index).padStart(2, "0")}.json`,
          import.meta.url,
        );
        const reportResult = compactBatchResult(result);
        await writeFile(outPath, `${JSON.stringify(reportResult, null, 2)}\n`, "utf8");
        results.push({ batchIndex: index, sources: sourceTables, result: reportResult });
        await logger.phase("batch:done", {
          batchIndex: index,
          batchNumber: index + 1,
          totalBatches: batches.length,
          durationMs: Date.now() - batchStartedAt,
          cleanupWrites: result.cleanup?.writes ?? 0,
          loadWrites: result.load?.writes ?? 0,
          reportPath: outPath.pathname,
        });
      } catch (error) {
        const errorReportPath = await writeBatchFailureReport(index, sourceTables, error);
        await logger.error("batch:failed", {
          batchIndex: index,
          batchNumber: index + 1,
          totalBatches: batches.length,
          durationMs: Date.now() - batchStartedAt,
          sources: sourceTables,
          errorReportPath,
          ...serializeMigrationError(error),
        });
        throw error;
      }
    }

    await logger.info("complete", { batchesProcessed: results.length });
    process.stdout.write(`${JSON.stringify({ batches: results.length, results }, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  const logger = createApplyBatchLogger({ logPath: resolveLogPath(process.env) });
  await logger.error("fatal", serializeMigrationError(error));
  process.exitCode = 1;
}

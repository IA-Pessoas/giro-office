#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CASTELO_ORGANIZATION_ID } from "./lib/mapping-contract.mjs";
import { buildSourceInventory } from "./lib/source-inventory.mjs";
import { ALL_MAPPING_RULES, createCompleteExecutionRegistry } from "./runtime/index.mjs";

const EXPECTED_SOURCE_TABLES = 312;
const EXPECTED_SOURCE_ROWS = 1_374_880;
const SOURCE_STATUS_PRIORITY = Object.freeze({ notEmitted: 1, prepared: 2, quarantine: 3 });
const ITEMIZABLE_MARKETING_SOURCES = new Set([
  "tb_mkt.eventos",
  "tb_mkt.eventos_edicoes",
  "tb_mkt.eventos_feedbacks_periodos",
  "tb_mkt.eventos_feedbacks",
  "tb_mkt.redes_sociais",
  "tb_mkt.senhas",
]);

export const MIGRATION_ORGANIZATION_ID = CASTELO_ORGANIZATION_ID;

export async function runDryRun({
  inventory,
  confirmedScope,
  executionRegistry,
  pendingMappings,
  createSession,
  reportStep,
  fastMode = false,
  policyExcludedSources = new Map(),
  itemizedSourceTables = [],
}) {
  validateDryRunInputs({
    inventory,
    confirmedScope,
    executionRegistry,
    pendingMappings,
    createSession,
    fastMode,
    itemizedSourceTables,
  });

  const inventoryBySource = new Map(inventory.tables.map((table) => [table.sourceTable, table]));
  const itemizedSources = new Set(itemizedSourceTables);
  const executableSources = new Set(
    [...executionRegistry.values()].map(({ sourceTable }) => sourceTable),
  );
  const pendingBySource = indexPendingMappings(pendingMappings);
  for (const sourceTable of executableSources) {
    if (pendingBySource.has(sourceTable)) throw dryRunError("DRY_RUN_SOURCE_OVERLAP");
    if (!inventoryBySource.has(sourceTable)) throw dryRunError("DRY_RUN_SOURCE_NOT_IN_INVENTORY");
  }
  for (const [sourceTable, pending] of pendingBySource) {
    const authenticated = inventoryBySource.get(sourceTable);
    if (authenticated === undefined) throw dryRunError("DRY_RUN_SOURCE_NOT_IN_INVENTORY");
    if (pending.sourceRowCount !== undefined && pending.sourceRowCount !== authenticated.rowCount) {
      throw dryRunError("DRY_RUN_PENDING_ROW_COUNT_MISMATCH");
    }
  }

  const sourceCounts = emptyCounts();
  const sourceCountsByTable = {};
  const statusCounts = emptyCounts();
  const destinationCounts = new Map();
  const tableQuarantine = [];
  const runtimeQuarantineGroups = fastMode === true ? null : new Map();
  const quarantineItems = [];
  let expectedWrites = 0;
  const expectedWriteCounts = { aggregate: 0, insert: 0, update: 0 };
  let unresolvedRequiredReferences = 0;
  const sourceOutcomes = new Map(
    [...executableSources].map((sourceTable) => [
      sourceTable,
      new Uint8Array(inventoryBySource.get(sourceTable).rowCount),
    ]),
  );

  const session = await createSession({
    inventory,
    confirmedScope,
    executionRegistry,
  });
  if (session === null || typeof session?.iterateStep !== "function") {
    throw dryRunError("DRY_RUN_SESSION_INVALID");
  }

  for (const [key, entry] of executionRegistry) {
    let sourceCursor = 0;
    try {
      for await (const result of session.iterateStep(key)) {
        const status = normalizeResultStatus(result?.status);
        const sourceRowCount = normalizeResultRowCount(result?.sourceRowCount);
        statusCounts[status] += sourceRowCount;
        const outcomes = sourceOutcomes.get(entry.sourceTable);
        if (sourceCursor + sourceRowCount > outcomes.length) {
          throw dryRunError("DRY_RUN_SOURCE_ACCOUNTING_OVERFLOW");
        }
        const priority = SOURCE_STATUS_PRIORITY[status];
        for (let index = sourceCursor; index < sourceCursor + sourceRowCount; index += 1) {
          if (priority > outcomes[index]) outcomes[index] = priority;
        }
        sourceCursor += sourceRowCount;

        const destination = destinationCounts.get(entry.destinationTable) ?? emptyCounts();
        destination[status] += status === "prepared" ? 1 : sourceRowCount;
        destinationCounts.set(entry.destinationTable, destination);
        if (status === "prepared") {
          const writeMetric = writeMetricFor(entry.contract?.write?.kind);
          if (writeMetric !== null) {
            expectedWrites += 1;
            expectedWriteCounts[writeMetric] += 1;
          }
        } else if (status === "quarantine") {
          if (fastMode !== true) {
            addRuntimeQuarantine(runtimeQuarantineGroups, result, entry, sourceRowCount);
          }
          if (itemizedSources.has(entry.sourceTable)) {
            if (
              sourceRowCount !== 1 ||
              typeof result?.sourceIdentityDigest !== "string" ||
              !/^sha256:[a-f0-9]{64}$/.test(result.sourceIdentityDigest)
            ) {
              throw dryRunError("DRY_RUN_MARKETING_QUARANTINE_IDENTITY_INVALID");
            }
            quarantineItems.push({
              sourceTable: entry.sourceTable,
              stepId: entry.stepId,
              sourceIdentityDigest: result.sourceIdentityDigest,
              field: typeof result.field === "string" ? result.field : null,
              reasonCode: normalizeReasonCode(result.reasonCode),
            });
          }
          if (isRequiredReferenceReason(result?.reasonCode)) {
            unresolvedRequiredReferences += sourceRowCount;
          }
        }
      }
    } catch (error) {
      const failure = dryRunError(sanitizedErrorCode(error));
      failure.stepKey = key;
      throw failure;
    }
    reportStep?.(key);
  }

  for (const sourceTable of executableSources) {
    const outcomes = sourceOutcomes.get(sourceTable);
    sourceCountsByTable[sourceTable] = outcomes.reduce((counts, priority) => {
      if (priority === SOURCE_STATUS_PRIORITY.prepared) counts.prepared += 1;
      else if (priority === SOURCE_STATUS_PRIORITY.quarantine) counts.quarantine += 1;
      else if (priority === SOURCE_STATUS_PRIORITY.notEmitted) counts.notEmitted += 1;
      return counts;
    }, emptyCounts());
    accountExecutableSource({
      authenticated: inventoryBySource.get(sourceTable),
      quarantine: tableQuarantine,
      sourceCounts,
      outcomes,
    });
  }

  for (const [sourceTable, pending] of pendingBySource) {
    const rowCount = inventoryBySource.get(sourceTable).rowCount;
    sourceCounts.quarantine += rowCount;
    statusCounts.quarantine += rowCount;
    tableQuarantine.push(
      sanitizeTableQuarantine({
        sourceTable,
        rowCount,
        reasonCode: pending?.reasonCode ?? "PENDING_SOURCE_NOT_CONFIRMED",
      }),
    );
  }

  for (const [sourceTable, reasonCode] of policyExcludedSources) {
    const authenticated = inventoryBySource.get(sourceTable);
    if (authenticated === undefined) throw dryRunError("DRY_RUN_SOURCE_NOT_IN_INVENTORY");
    const rowCount = authenticated.rowCount;
    sourceCounts.notEmitted += rowCount;
    statusCounts.notEmitted += rowCount;
    tableQuarantine.push(
      sanitizeTableQuarantine({
        sourceTable,
        rowCount,
        reasonCode,
        reason: "Origem excluída da carga por política operacional.",
      }),
    );
  }

  const unclassified = inventory.tables.filter(
    ({ sourceTable }) =>
      !executableSources.has(sourceTable) &&
      !pendingBySource.has(sourceTable) &&
      !policyExcludedSources.has(sourceTable),
  );
  for (const table of unclassified) {
    sourceCounts.quarantine += table.rowCount;
    statusCounts.quarantine += table.rowCount;
    tableQuarantine.push(
      sanitizeTableQuarantine({
        sourceTable: table.sourceTable,
        rowCount: table.rowCount,
        reasonCode: "UNCLASSIFIED_SOURCE_TABLE",
        reason: "Origem ausente do registry executável e das pendências autenticadas.",
      }),
    );
  }

  const totalSourceRows = inventory.tables.reduce((total, table) => total + table.rowCount, 0);
  const blockingQuarantine = statusCounts.quarantine;
  const quarantine = [
    ...(runtimeQuarantineGroups === null ? [] : finalizeRuntimeQuarantine(runtimeQuarantineGroups)),
    ...tableQuarantine,
  ].sort(compareQuarantine);
  const complete =
    totalSourceRows === sourceCounts.prepared + sourceCounts.notEmitted + sourceCounts.quarantine &&
    totalSourceRows === EXPECTED_SOURCE_ROWS &&
    inventory.tables.length === EXPECTED_SOURCE_TABLES &&
    executableSources.size === 103 &&
    executionRegistry.size === 133 &&
    pendingBySource.size === 209 &&
    unclassified.length === 0 &&
    blockingQuarantine === 0 &&
    unresolvedRequiredReferences === 0;

  return deepFreeze({
    inventoryCounts: {
      executableSources: executableSources.size,
      pendingSources: pendingBySource.size,
      sources: inventory.tables.length,
      steps: executionRegistry.size,
      rows: totalSourceRows,
    },
    statusCounts,
    sourceCounts,
    sourceCountsByTable,
    destinationCounts: Object.fromEntries(
      [...destinationCounts].sort(([left], [right]) => compareText(left, right)),
    ),
    quarantine,
    quarantineItems: quarantineItems.sort(
      (left, right) =>
        compareText(left.sourceTable, right.sourceTable) ||
        compareText(left.stepId, right.stepId) ||
        compareText(left.sourceIdentityDigest, right.sourceIdentityDigest),
    ),
    expectedWrites,
    expectedWriteCounts,
    blockers: {
      quarantine: blockingQuarantine,
      unresolvedRequiredReferences,
      unclassifiedSources: unclassified.length,
    },
    complete,
  });
}

export async function runConfiguredDryRun({ sourceDir, organizationId, resolutions = [] }) {
  if (organizationId !== CASTELO_ORGANIZATION_ID) {
    throw dryRunError("DRY_RUN_TENANT_NOT_SUPPORTED");
  }
  if (typeof sourceDir !== "string" || sourceDir.trim().length === 0) {
    throw dryRunError("DRY_RUN_SOURCE_DIR_REQUIRED");
  }
  const resolvedSourceDir = path.resolve(sourceDir);
  const { buildConfirmedScope } = await import("./lib/confirmed-scope.mjs");
  const { createExecutionSession } = await import("./lib/execution-engine.mjs");
  const { createRuntimeOptionsFromRows, loadRuntimeSourceRows } = await import(
    "./lib/runtime-options.mjs"
  );
  const { createCompleteRuntimeStateByStep } = await import("./runtime/index.mjs");

  const [tableMappings, destinationMappings, pendingMappings, inventory] = await Promise.all([
    readJson(new URL("../mapping/tables.json", import.meta.url)),
    readJson(new URL("../mapping/destinations.json", import.meta.url)),
    readJson(new URL("../pending-mapping/tables.json", import.meta.url)),
    buildSourceInventory({
      sourceDir: resolvedSourceDir,
      expectedTables: EXPECTED_SOURCE_TABLES,
    }),
  ]);
  const confirmedScope = buildConfirmedScope({
    inventory,
    tableMappings,
    destinationMappings,
    sourceDigest: inventory.sourceDigest,
    pendingMappings,
  });
  const executionRegistry = createCompleteExecutionRegistry();
  if (
    !Array.isArray(resolutions) ||
    resolutions.some(
      (resolution) =>
        !/^sha256:[a-f0-9]{64}$/.test(resolution?.sourceIdentityDigest) ||
        typeof resolution?.canonicalTargetId !== "string" ||
        resolution.canonicalTargetId.length === 0,
    )
  ) {
    throw dryRunError("DRY_RUN_MARKETING_RESOLUTIONS_INVALID");
  }
  const contextSourceTables = new Set(confirmedScope.sources.map(({ sourceTable }) => sourceTable));
  const pendingContextSources = confirmedScope.steps.flatMap(({ dependencies }) => dependencies);
  while (pendingContextSources.length > 0) {
    const sourceTable = pendingContextSources.pop();
    if (contextSourceTables.has(sourceTable)) continue;
    contextSourceTables.add(sourceTable);
    for (const step of confirmedScope.steps) {
      if (step.sourceTable === sourceTable) pendingContextSources.push(...step.dependencies);
    }
  }
  const sourceRowsByTable = await loadRuntimeSourceRows({
    sourceDir: resolvedSourceDir,
    sourceTables: [...contextSourceTables],
  });
  const runtimeOptions = createRuntimeOptionsFromRows({
    sourceRowsByTable,
    destinationRowsByTable: new Map(),
  });
  const resolutionMap = new Map(
    resolutions.map(({ sourceIdentityDigest, canonicalTargetId }) => [
      sourceIdentityDigest,
      canonicalTargetId,
    ]),
  );
  const runtimeStateByStep = createCompleteRuntimeStateByStep({
    ...runtimeOptions,
    remaining: { ...runtimeOptions.remaining, marketingEventEditionResolutions: resolutionMap },
  });
  const ruleRegistry = new Map(ALL_MAPPING_RULES.map((rule) => [rule.sourceTable, rule]));
  const createSession = () =>
    createExecutionSession({
      scope: confirmedScope,
      sourceDir: resolvedSourceDir,
      mappingPackage: { inventory, tableMappings, destinationMappings },
      ruleRegistry,
      executionRegistry,
      runtimeStateByStep,
      organizationId,
      destinationReader: async function* emptyDestinationReader() {},
    });
  return runDryRun({
    inventory,
    confirmedScope,
    executionRegistry,
    pendingMappings,
    createSession,
    itemizedSourceTables: [...ITEMIZABLE_MARKETING_SOURCES],
  });
}

async function runCli(args) {
  if (args.includes("--apply")) throw dryRunError("DRY_RUN_APPLY_REJECTED");
  if (args.length !== 2 || args[0] !== "--source-dir") {
    throw dryRunError("DRY_RUN_SOURCE_DIR_REQUIRED");
  }
  return runConfiguredDryRun({
    sourceDir: args[1],
    organizationId: CASTELO_ORGANIZATION_ID,
  });
}

function accountExecutableSource({ authenticated, quarantine, sourceCounts, outcomes }) {
  let missing = 0;
  for (const priority of outcomes) {
    if (priority === SOURCE_STATUS_PRIORITY.quarantine) sourceCounts.quarantine += 1;
    else if (priority === SOURCE_STATUS_PRIORITY.prepared) sourceCounts.prepared += 1;
    else if (priority === SOURCE_STATUS_PRIORITY.notEmitted) sourceCounts.notEmitted += 1;
    else missing += 1;
  }
  if (missing === 0) return;
  sourceCounts.quarantine += missing;
  quarantine.push(
    sanitizeTableQuarantine({
      sourceTable: authenticated.sourceTable,
      rowCount: missing,
      reasonCode: "DRY_RUN_SOURCE_ACCOUNTING_MISMATCH",
      reason: "O runtime não classificou todas as linhas autenticadas da origem.",
    }),
  );
}

function writeMetricFor(kind) {
  if (kind === "insert") return "insert";
  if (kind === "update_exactly_one") return "update";
  if (kind === "replace_owned_aggregate") return "aggregate";
  return null;
}

function addRuntimeQuarantine(groups, result, entry, rowCount) {
  const field = typeof result?.field === "string" ? result.field : null;
  const reasonCode = normalizeReasonCode(result?.reasonCode);
  const key = JSON.stringify([entry.sourceTable, entry.stepId, field, reasonCode]);
  const group = groups.get(key) ?? {
    sourceTable: entry.sourceTable,
    stepId: entry.stepId,
    destinationTable: entry.destinationTable,
    field,
    reasonCode,
    rowCount: 0,
    sourceIdentityDigests: [],
  };
  group.rowCount += rowCount;
  const digest = result?.sourceIdentityDigest;
  if (
    typeof digest === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(digest) &&
    !group.sourceIdentityDigests.includes(digest)
  ) {
    group.sourceIdentityDigests.push(digest);
    group.sourceIdentityDigests.sort(compareText);
    if (group.sourceIdentityDigests.length > 20) group.sourceIdentityDigests.length = 20;
  }
  groups.set(key, group);
}

function finalizeRuntimeQuarantine(groups) {
  return [...groups.values()].map((group) =>
    Object.freeze({
      sourceTable: group.sourceTable,
      stepId: group.stepId,
      destinationTable: group.destinationTable,
      field: group.field,
      reasonCode: group.reasonCode,
      rowCount: group.rowCount,
      sourceIdentityDigests: Object.freeze([...group.sourceIdentityDigests]),
    }),
  );
}

function sanitizeTableQuarantine({ sourceTable, rowCount, reasonCode }) {
  return Object.freeze({
    sourceTable,
    reasonCode: normalizeReasonCode(reasonCode),
    rowCount,
  });
}

function indexPendingMappings(pendingMappings) {
  const indexed = new Map();
  for (const pending of pendingMappings) {
    if (indexed.has(pending.sourceTable)) throw dryRunError("DRY_RUN_PENDING_DUPLICATE");
    indexed.set(pending.sourceTable, pending);
  }
  return indexed;
}

function normalizeResultStatus(status) {
  if (status === "prepared") return "prepared";
  if (status === "not_emitted") return "notEmitted";
  if (status === "quarantine") return "quarantine";
  throw dryRunError("DRY_RUN_RESULT_STATUS_INVALID");
}

function normalizeResultRowCount(value) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw dryRunError("DRY_RUN_RESULT_ROW_COUNT_INVALID");
  }
  return value;
}

function normalizeReasonCode(value) {
  return typeof value === "string" && /^[A-Z0-9_.-]+$/.test(value)
    ? value
    : "DRY_RUN_REASON_INVALID";
}

function sanitizedErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_.-]+$/.test(error.code)
    ? error.code
    : "DRY_RUN_STEP_FAILED";
}

function isRequiredReferenceReason(reasonCode) {
  return typeof reasonCode === "string" && reasonCode.includes("REFERENCE");
}

function emptyCounts() {
  return { prepared: 0, notEmitted: 0, quarantine: 0 };
}

function validateDryRunInputs(options) {
  if (typeof options.fastMode !== "boolean") {
    throw TypeError("options.fastMode inválido");
  }
  if (!Array.isArray(options.inventory?.tables)) throw new TypeError("inventory inválido");
  if (!Array.isArray(options.confirmedScope?.sources)) {
    throw new TypeError("confirmedScope inválido");
  }
  if (!(options.executionRegistry instanceof Map)) {
    throw new TypeError("executionRegistry deve ser Map");
  }
  if (!Array.isArray(options.pendingMappings)) throw new TypeError("pendingMappings inválido");
  const itemizedSourceTables = options.itemizedSourceTables ?? [];
  if (
    !Array.isArray(itemizedSourceTables) ||
    itemizedSourceTables.some((sourceTable) => !ITEMIZABLE_MARKETING_SOURCES.has(sourceTable)) ||
    new Set(itemizedSourceTables).size !== itemizedSourceTables.length
  ) {
    throw dryRunError("DRY_RUN_ITEMIZED_SOURCES_INVALID");
  }
  if (typeof options.createSession !== "function") throw new TypeError("createSession inválido");
  const inventorySources = new Set();
  for (const table of options.inventory.tables) {
    if (
      typeof table?.sourceTable !== "string" ||
      !Number.isSafeInteger(table?.rowCount) ||
      table.rowCount < 0 ||
      inventorySources.has(table.sourceTable)
    ) {
      throw dryRunError("DRY_RUN_INVENTORY_INVALID");
    }
    inventorySources.add(table.sourceTable);
  }
  if (itemizedSourceTables.some((sourceTable) => !inventorySources.has(sourceTable))) {
    throw dryRunError("DRY_RUN_ITEMIZED_SOURCE_NOT_IN_INVENTORY");
  }
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function compareQuarantine(left, right) {
  return (
    compareText(left.sourceTable, right.sourceTable) ||
    compareText(left.stepId ?? "", right.stepId ?? "") ||
    compareText(left.field ?? "", right.field ?? "") ||
    compareText(left.reasonCode, right.reasonCode)
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function dryRunError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  try {
    const report = await runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "DRY_RUN_FAILED"}\n`);
    process.exitCode = 1;
  }
}

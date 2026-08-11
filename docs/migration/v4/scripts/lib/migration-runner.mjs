import { randomUUID } from "node:crypto";
import { getExecutionResultMetadata } from "./execution-engine.mjs";
import { CASTELO_ORGANIZATION_ID } from "./mapping-contract.mjs";

const MAX_BATCH_SIZE = 500;
const MAX_CLEANUP_BATCH_SIZE = 500;
const MAX_RECONCILIATION_TARGETS = 5000;
const DEFAULT_OPERATIONS = Object.freeze({
  cleanup: cleanupMappedData,
  load: loadMappedData,
  reconcile: reconcileMappedData,
});

function logApplyPhase(phase, context = {}) {
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "phase",
      event: `apply-phase:${phase}`,
      ...context,
    })}\n`,
  );
}

export async function runMigration(options) {
  const operations = options?.operations ?? DEFAULT_OPERATIONS;
  validateMigrationOptions(options, operations);
  const { client } = options;
  const batchIndex = options.batchIndex;

  await client.query("BEGIN");
  try {
    logApplyPhase("cleanup:start", { batchIndex, steps: options.plan?.steps?.length ?? 0 });
    const cleanupResult =
      options.skipCleanup === true
        ? Object.freeze({ targets: 0, writes: 0 })
        : await operations.cleanup(client, options.plan, options.organizationId);
    logApplyPhase("cleanup:done", {
      batchIndex,
      writes: cleanupResult?.writes ?? 0,
      targets: cleanupResult?.targets ?? 0,
    });
    logApplyPhase("load:start", { batchIndex, batchSize: options.batchSize });
    const loadResult = await operations.load(
      client,
      options.executionSession,
      options.organizationId,
      options.batchSize,
      options.plan,
    );
    logApplyPhase("load:done", {
      batchIndex,
      writes: loadResult?.writes ?? 0,
      prepared: loadResult?.prepared ?? 0,
      reconciliationTargets: loadResult?.reconciliationTargets?.length ?? 0,
    });
    logApplyPhase("reconcile:start", { batchIndex });
    const reconciliation = await operations.reconcile(
      client,
      options.dryRunReport,
      options.organizationId,
      {
        cleanupResult,
        loadResult,
        plan: options.plan,
        allowPartial: options.allowPartial === true,
        partialBatch: options.partialBatch === true,
      },
    );
    logApplyPhase("reconcile:done", {
      batchIndex,
      databaseQueries: reconciliation?.databaseQueries ?? 0,
    });
    await client.query("COMMIT");
    return Object.freeze({
      mode: "apply",
      writesPerformed: (cleanupResult?.writes ?? 0) + (loadResult?.writes ?? 0) > 0,
      cleanup: cleanupResult,
      load: loadResult,
      reconciliation,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logApplyPhase("rollback", {
      batchIndex,
      code: error?.code ?? null,
      message: error?.message ?? String(error),
    });
    throw error;
  }
}

export async function cleanupMappedData(client, plan, organizationId) {
  const context = validatePlan(plan, organizationId, { requireCleanupSession: true });
  let writes = 0;
  let targets = 0;
  const aggregateTargets = new Set();

  for (const step of orderMigrationSteps(context.steps, "cleanup")) {
    if (step.contract.write.kind === "none") continue;
    logApplyPhase("cleanup:step:start", {
      stepKey: step.key,
      sourceTable: step.sourceTable,
      destinationTable: step.destinationTable,
      cleanupKind: step.contract.cleanup.kind,
    });
    const cleanupKind = step.contract.cleanup.kind;
    if (cleanupKind === "delete_by_identity") {
      if (plan?.skipEmptyCleanup === true) {
        const tenantColumn = step.contract.tenantScope.column;
        const existing = await client.query(
          `SELECT 1 FROM ${step.tableSql} WHERE ${quoteIdentifier(tenantColumn)} = $1 LIMIT 1`,
          [organizationId],
        );
        if (existing.rowCount === 0) continue;
      }
      const identities = [];
      for await (const result of plan.cleanupSession.iterateStep(step.key)) {
        const identity = cleanupResultIdentity(step, result, organizationId);
        if (identity !== null) identities.push(identity);
      }
      for (let offset = 0; offset < identities.length; offset += MAX_CLEANUP_BATCH_SIZE) {
        const identityBatch = identities.slice(offset, offset + MAX_CLEANUP_BATCH_SIZE);
        const where = buildBatchDeleteWhere(step, identityBatch, organizationId);
        const queryResult = await client.query(
          `DELETE FROM ${step.tableSql} WHERE ${where.sql}`,
          where.values,
        );
        if (
          !Number.isSafeInteger(queryResult.rowCount) ||
          queryResult.rowCount < 0 ||
          queryResult.rowCount > identityBatch.length
        ) {
          throw migrationError("MIGRATION_CLEANUP_ROW_COUNT_MISMATCH");
        }
        targets += identityBatch.length;
        writes += queryResult.rowCount;
      }
      continue;
    }
    for await (const result of plan.cleanupSession.iterateStep(step.key)) {
      const identity = cleanupResultIdentity(step, result, organizationId);
      if (identity === null) continue;
      let queryResult;
      if (["reset_owned_columns", "replace_owned_aggregate"].includes(cleanupKind)) {
        if (cleanupKind === "replace_owned_aggregate") {
          const targetKey = `${step.key}\0${JSON.stringify(identity)}`;
          if (aggregateTargets.has(targetKey)) {
            // Uma linha filha por atividade pode repetir o mesmo pai agregado;
            // a limpeza deve resetar o pai apenas uma vez.
            continue;
          }
          aggregateTargets.add(targetKey);
        }
        const resetValues = Object.fromEntries(
          Object.entries(step.contract.cleanup.resetValues).filter(
            ([column]) =>
              !step.contract.cleanup.identityColumns.includes(column) &&
              column !== step.contract.tenantScope.column,
          ),
        );
        const reset = buildAssignments(step, resetValues, 1);
        const where = buildWhere(step, identity, organizationId, reset.values.length + 1);
        queryResult = await client.query(
          `UPDATE ${step.tableSql} SET ${reset.sql} WHERE ${where.sql}`,
          [...reset.values, ...where.values],
        );
        if (
          queryResult.rowCount === 0 &&
          plan?.skipMissingMergeTargets === true &&
          ["update_exactly_one", "replace_owned_aggregate"].includes(step.contract.write.kind)
        ) {
          continue;
        }
        if (queryResult.rowCount !== 1) {
          if (result?.status !== "prepared" && queryResult.rowCount === 0) {
            continue;
          }
          throw migrationError("MIGRATION_CLEANUP_ROW_COUNT_MISMATCH", {
            stepKey: step.key,
            sourceTable: step.sourceTable,
            stepId: step.stepId,
            destinationTable: step.destinationTable,
            cleanupKind,
            identity,
            resultStatus: result?.status ?? null,
            rowCount: queryResult.rowCount ?? null,
          });
        }
      } else {
        throw migrationError("MIGRATION_CLEANUP_CONTRACT_INVALID");
      }
      targets += 1;
      writes += queryResult.rowCount;
    }
  }
  return Object.freeze({ targets, writes });
}

export async function loadMappedData(client, executionSession, organizationId, batchSize, plan) {
  const context = validatePlan(plan, organizationId);
  const skipDuplicateInserts = plan?.skipDuplicateInserts === true;
  if (typeof executionSession?.iterateStep !== "function") {
    throw new TypeError("executionSession inválida");
  }
  const metrics = {
    destinationCounts: {},
    prepared: 0,
    reconciliationTargets: [],
    skipped: 0,
    writes: 0,
  };
  const aggregateTargets = new Set();

  for (const step of orderMigrationSteps(context.steps, "load")) {
    let insertBatch = [];
    let insertColumns = null;
    const flush = async () => {
      if (insertBatch.length === 0) return;
      let rowsToInsert = insertBatch;
      if (plan?.skipUnresolvedForeignKeys === true) {
        const requiredColumns = (step.requiredColumns ?? []).filter((column) =>
          insertColumns.includes(column),
        );
        const validRequiredRows = rowsToInsert.filter((row) =>
          requiredColumns.every((column) => row[column] !== null && row[column] !== undefined),
        );
        metrics.skipped += rowsToInsert.length - validRequiredRows.length;
        rowsToInsert = validRequiredRows;
        const filtered = await filterRowsWithMissingForeignKeys(
          client,
          step,
          rowsToInsert,
          organizationId,
        );
        rowsToInsert = filtered.rows;
        metrics.skipped += filtered.skipped;
      }
      if (rowsToInsert.length === 0) {
        insertBatch = [];
        return;
      }
      const insertResult = await insertRows(client, step, insertColumns, rowsToInsert, {
        onConflictDoNothing: skipDuplicateInserts,
      });
      metrics.writes += insertResult.writes;
      for (const payload of insertResult.insertedRows) {
        metrics.reconciliationTargets.push(reconciliationTarget(step, payload));
      }
      insertBatch = [];
    };

    for await (const result of executionSession.iterateStep(step.key)) {
      if (result?.status === "not_emitted" || result?.status === "quarantine") continue;
      if (result?.status !== "prepared") throw migrationError("MIGRATION_EXECUTION_NOT_COMPLETE");
      metrics.prepared += 1;
      metrics.destinationCounts[step.destinationTable] =
        (metrics.destinationCounts[step.destinationTable] ?? 0) + 1;
      if (step.contract.write.kind === "none") continue;

      const payload = applyInsertTimestampDefaults(
        step,
        validatePayload(step, result.payload, organizationId),
      );
      if (step.contract.write.kind === "insert") {
        const columns = Object.keys(payload).sort(compareText);
        if (insertColumns !== null && !sameColumns(insertColumns, columns)) await flush();
        insertColumns = columns;
        insertBatch.push(payload);
        if (insertBatch.length === batchSize) await flush();
        continue;
      }

      const identity = resultIdentity(step, result, organizationId);
      if (step.contract.write.kind === "replace_owned_aggregate") {
        const targetKey = `${step.key}\0${JSON.stringify(identity)}`;
        if (aggregateTargets.has(targetKey)) {
          // Duplicatas de identidade agregada não devem abortar o lote; o
          // primeiro grupo determinístico já representa o pai e os demais
          // são apenas replay/duplicata histórica.
          metrics.skipped += 1;
          continue;
        }
        aggregateTargets.add(targetKey);
      }
      const valuesToWrite = Object.fromEntries(
        Object.entries(payload).filter(
          ([column]) =>
            !step.contract.cleanup.identityColumns.includes(column) &&
            column !== step.contract.tenantScope.column &&
            (step.contract.write.kind !== "update_exactly_one" ||
              step.contract.cleanup.ownedColumns.includes(column)),
        ),
      );
      assertOwnedUpdate(step, valuesToWrite);
      const assignments = buildAssignments(step, valuesToWrite, 1);
      const where = buildWhere(step, identity, organizationId, assignments.values.length + 1);
      const queryResult = await client.query(
        `UPDATE ${step.tableSql} SET ${assignments.sql} WHERE ${where.sql}`,
        [...assignments.values, ...where.values],
      );
      if (
        queryResult.rowCount === 0 &&
        plan?.upsertPermissionMerges === true &&
        ["permissions", "permissions.specific"].includes(step.destinationTable)
      ) {
        const insertPayload = {
          ...(step.destinationTable === "permissions" ? { id: randomUUID() } : {}),
          ...Object.fromEntries(
            step.contract.cleanup.identityColumns.map((column) => [column, identity[column]]),
          ),
          ...valuesToWrite,
        };
        const insertColumns = Object.keys(insertPayload).sort(compareText);
        const insertValues = insertColumns.map((column) => insertPayload[column]);
        const conflictColumns =
          step.destinationTable === "permissions"
            ? ["user_id", "organization_id"]
            : ["user_id"];
        const updateColumns = Object.keys(valuesToWrite).filter(
          (column) => !conflictColumns.includes(column),
        );
        const conflictSql =
          updateColumns.length === 0
            ? "DO NOTHING"
            : `DO UPDATE SET ${updateColumns
                .sort(compareText)
                .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
                .join(", ")}`;
        const upsertResult = await client.query(
          `INSERT INTO ${step.tableSql} (${insertColumns
            .map(quoteIdentifier)
            .join(", ")}) VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(", ")}) ON CONFLICT (${conflictColumns
            .map(quoteIdentifier)
            .join(", ")}) ${conflictSql}`,
          insertValues,
        );
        if (!Number.isSafeInteger(upsertResult.rowCount) || upsertResult.rowCount < 0) {
          throw migrationError("MIGRATION_UPDATE_ROW_COUNT_MISMATCH");
        }
        metrics.reconciliationTargets.push(reconciliationTarget(step, payload, identity));
        metrics.writes += 1;
        continue;
      }
      if (
        queryResult.rowCount === 0 &&
        plan?.skipMissingMergeTargets === true &&
        ["update_exactly_one", "replace_owned_aggregate"].includes(step.contract.write.kind)
      ) {
        metrics.skipped += 1;
        continue;
      }
      assertExactlyOne(queryResult, "MIGRATION_UPDATE_ROW_COUNT_MISMATCH");
      metrics.reconciliationTargets.push(reconciliationTarget(step, payload, identity));
      metrics.writes += 1;
    }
    await flush();
  }

  return Object.freeze({
    ...metrics,
    destinationCounts: Object.freeze({ ...metrics.destinationCounts }),
    reconciliationTargets: Object.freeze([...metrics.reconciliationTargets]),
  });
}

async function filterRowsWithMissingForeignKeys(client, step, rows, organizationId) {
  const foreignKeys = step.requiredForeignKeys ?? [];
  if (foreignKeys.length === 0) return { rows, skipped: 0 };
  const keep = new Set(rows.map((_, index) => index));
  for (const foreignKey of foreignKeys) {
    const values = [
      ...new Set(
        rows
          .map((row) => row[foreignKey.column])
          .filter((value) => value !== null && value !== undefined),
      ),
    ];
    if (values.length === 0) continue;
    const organizationsTarget = foreignKey.targetTable === "organizations";
    const placeholders = values
      .map((_, index) => `$${index + (organizationsTarget ? 1 : 2)}`)
      .join(", ");
    const tenantPredicate = organizationsTarget
      ? `"${foreignKey.targetColumn}" IN (${placeholders})`
      : `"organization_id" = $1 AND "${foreignKey.targetColumn}" IN (${placeholders})`;
    const result = await client.query(
      `SELECT "${foreignKey.targetColumn}" FROM "${foreignKey.targetTable}" WHERE ${tenantPredicate}`,
      organizationsTarget ? values : [organizationId, ...values],
    );
    const existing = new Set((result.rows ?? []).map((row) => String(row[foreignKey.targetColumn])));
    for (const [index, row] of rows.entries()) {
      const value = row[foreignKey.column];
      if (value !== null && value !== undefined && !existing.has(String(value))) keep.delete(index);
    }
  }
  return {
    rows: rows.filter((_, index) => keep.has(index)),
    skipped: rows.length - keep.size,
  };
}

export async function reconcileMappedData(client, dryRunReport, organizationId, context) {
  const load = context?.loadResult;
  const allowPartial = context?.allowPartial === true;
  const partialBatch = context?.partialBatch === true;
  if (
    (allowPartial !== true && dryRunReport?.complete !== true) ||
    dryRunReport?.writesPerformed === true
  ) {
    throw migrationError("MIGRATION_RECONCILIATION_MISMATCH", {
      reason: "dry_run_gate",
      allowPartial,
      complete: dryRunReport?.complete,
      writesPerformed: dryRunReport?.writesPerformed,
    });
  }
  if (
    partialBatch !== true &&
    (!Number.isSafeInteger(dryRunReport?.expectedWrites) ||
      load?.writes !== dryRunReport.expectedWrites ||
      !sameDestinationCounts(load?.destinationCounts, dryRunReport?.destinationCounts))
  ) {
    throw migrationError("MIGRATION_RECONCILIATION_MISMATCH", {
      reason: "full_run_counts",
      partialBatch,
      loadWrites: load?.writes ?? null,
      expectedWrites: dryRunReport?.expectedWrites ?? null,
      destinationCountsMatch: sameDestinationCounts(
        load?.destinationCounts,
        dryRunReport?.destinationCounts,
      ),
    });
  }
  const groupedTargets = Map.groupBy(load.reconciliationTargets ?? [], ({ step }) => step.key);
  let databaseQueries = 0;
  for (const targets of groupedTargets.values()) {
    const step = targets[0].step;
    for (let offset = 0; offset < targets.length; offset += MAX_RECONCILIATION_TARGETS) {
      const targetBatch = targets.slice(offset, offset + MAX_RECONCILIATION_TARGETS);
      const expected = targetBatch.map(
        ({ aggregateColumn, expectedAggregateCount, identity }) => ({
          aggregateColumn,
          expectedAggregateCount,
          identity,
        }),
      );
      const query = buildReconciliationQuery(step);
      const result = await client.query(query, [JSON.stringify(expected), organizationId]);
      databaseQueries += 1;
      const row = result?.rows?.[0];
      if (
        Number(row?.persisted_count) !== expected.length ||
        Number(row?.tenant_leak_count) !== 0 ||
        Number(row?.required_fk_mismatch_count) !== 0 ||
        Number(row?.aggregate_payload_mismatch_count) !== 0
      ) {
        throw migrationError("MIGRATION_RECONCILIATION_MISMATCH", {
          reason: "persisted_aggregate_check",
          stepKey: step.key,
          sourceTable: step.sourceTable,
          stepId: step.stepId,
          destinationTable: step.destinationTable,
          persisted_count: Number(row?.persisted_count),
          expected_count: expected.length,
          tenant_leak_count: Number(row?.tenant_leak_count),
          required_fk_mismatch_count: Number(row?.required_fk_mismatch_count),
          aggregate_payload_mismatch_count: Number(row?.aggregate_payload_mismatch_count),
        });
      }
    }
  }
  return Object.freeze({
    databaseQueries,
    matches: true,
    prepared: load.prepared,
    writes: load.writes,
  });
}

function validateMigrationOptions(options, operations) {
  if (typeof options?.client?.query !== "function") throw new TypeError("client inválido");
  if (!Array.isArray(options?.plan?.steps)) throw new TypeError("plan inválido");
  if (options.organizationId !== CASTELO_ORGANIZATION_ID) {
    throw migrationError("MIGRATION_TENANT_NOT_CASTELO");
  }
  if (
    options.dryRunReport?.writesPerformed !== false ||
    (options.allowPartial !== true && options.dryRunReport?.complete !== true)
  ) {
    throw migrationError("MIGRATION_DRY_RUN_NOT_ACCEPTED");
  }
  if (options.snapshotManifest?.restorable !== true) {
    throw migrationError("MIGRATION_SNAPSHOT_NOT_RESTORABLE");
  }
  if (
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > MAX_BATCH_SIZE
  ) {
    throw migrationError("MIGRATION_BATCH_SIZE_INVALID");
  }
  for (const name of ["cleanup", "load", "reconcile"]) {
    if (typeof operations?.[name] !== "function") {
      throw new TypeError(`operations.${name} inválida`);
    }
  }
}

export function validatePlan(plan, organizationId, { requireCleanupSession = false } = {}) {
  if (!Array.isArray(plan?.steps) || !Array.isArray(plan?.catalog?.models)) {
    throw new TypeError("plan validado exige steps e catalog");
  }
  if (requireCleanupSession && typeof plan.cleanupSession?.iterateStep !== "function") {
    throw new TypeError("plan.cleanupSession inválida");
  }
  const keys = new Set();
  const steps = plan.steps.map((candidate) => {
    if (typeof candidate?.key !== "string" || keys.has(candidate.key)) {
      throw migrationError("MIGRATION_PLAN_STEP_INVALID");
    }
    keys.add(candidate.key);
    const model = plan.catalog.models.find(
      ({ databaseName }) => databaseName === candidate.destinationTable,
    );
    if (model === undefined) throw migrationError("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
    const fields = new Set(
      model.fields
        .filter(({ relationModel }) => relationModel === null || relationModel === undefined)
        .map(({ databaseName }) => databaseName),
    );
    const { cleanup: declaredCleanup, tenantScope, write } = candidate.contract ?? {};
    const cleanup =
      declaredCleanup?.kind === "none"
        ? { kind: "none", identityColumns: [], ownedColumns: [], resetValues: {} }
        : declaredCleanup;
    if (
      tenantScope?.kind !== "organization_column" ||
      tenantScope.column !== "organization_id" ||
      tenantScope.organizationId !== organizationId ||
      !fields.has(tenantScope.column) ||
      !["insert", "none", "replace_owned_aggregate", "update_exactly_one"].includes(write?.kind)
    ) {
      throw migrationError("MIGRATION_PLAN_CONTRACT_INVALID");
    }
    validateColumnList(cleanup?.identityColumns, fields);
    validateColumnList(cleanup?.ownedColumns, fields);
    if (!isPlainObject(cleanup?.resetValues)) {
      throw migrationError("MIGRATION_CLEANUP_CONTRACT_INVALID");
    }
    const resetColumns = Object.keys(cleanup.resetValues).sort(compareText);
    const ownedColumns = [...cleanup.ownedColumns].sort(compareText);
    if (!sameColumns(resetColumns, ownedColumns)) {
      throw migrationError("MIGRATION_CLEANUP_CONTRACT_INVALID");
    }
    if (
      (write.kind === "none" && cleanup.kind !== "none") ||
      (write.kind === "insert" && cleanup.kind !== "delete_by_identity") ||
      (write.kind === "update_exactly_one" && cleanup.kind !== "reset_owned_columns") ||
      (write.kind === "replace_owned_aggregate" &&
        (cleanup.kind !== "replace_owned_aggregate" || cleanup.ownedColumns.length !== 1))
    ) {
      throw migrationError("MIGRATION_CLEANUP_CONTRACT_INVALID");
    }
    return Object.freeze({
      ...candidate,
      contract: Object.freeze({ ...candidate.contract, cleanup: Object.freeze(cleanup) }),
      fields,
      jsonColumns: new Set(
        model.fields
          .filter(
            ({ relationModel, prismaType }) =>
              (relationModel === null || relationModel === undefined) && prismaType === "Json",
          )
          .map(({ databaseName }) => databaseName),
      ),
      requiredForeignKeys: requiredForeignKeys(model, plan.catalog),
      requiredColumns: model.fields
        .filter(
          ({ relationModel, nullable }) =>
            (relationModel === null || relationModel === undefined) && nullable === false,
        )
        .map(({ databaseName }) => databaseName),
      tableSql: quoteIdentifier(candidate.destinationTable),
    });
  });
  return Object.freeze({ steps });
}

export function orderMigrationSteps(steps, phase) {
  if (!Array.isArray(steps) || !["cleanup", "load"].includes(phase)) {
    throw new TypeError("ordenação de migração inválida");
  }
  const pending = [...steps];
  const ordered = [];
  const completedSources = new Set();
  while (pending.length > 0) {
    const index = pending.findIndex((step) =>
      (step.dependencies ?? []).every(
        (dependency) =>
          completedSources.has(dependency) ||
          !steps.some(({ sourceTable }) => sourceTable === dependency),
      ),
    );
    if (index === -1) throw migrationError("MIGRATION_PLAN_DEPENDENCY_CYCLE");
    const [next] = pending.splice(index, 1);
    ordered.push(next);
    if (!pending.some(({ sourceTable }) => sourceTable === next.sourceTable)) {
      completedSources.add(next.sourceTable);
    }
  }
  return phase === "cleanup" ? ordered.reverse() : ordered;
}

function validateColumnList(columns, fields) {
  if (!Array.isArray(columns) || columns.some((column) => !fields.has(column))) {
    throw migrationError("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
  }
}

function applyInsertTimestampDefaults(step, payload) {
  const enriched = { ...payload };
  const now = new Date();
  for (const column of step.fields) {
    if (enriched[column] !== undefined && enriched[column] !== null) continue;
    if (column === "created_at" || column === "createdAt" || column === "updated_at" || column === "updatedAt") {
      enriched[column] = now;
    }
  }
  return enriched;
}

function validatePayload(step, payload, organizationId) {
  if (!isPlainObject(payload)) throw migrationError("MIGRATION_PAYLOAD_INVALID");
  for (const column of Object.keys(payload)) {
    if (!step.fields.has(column)) throw migrationError("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
  }
  const tenantValue = payload[step.contract.tenantScope.column];
  if (tenantValue !== undefined && tenantValue !== organizationId) {
    throw migrationError("MIGRATION_TENANT_NOT_CASTELO");
  }
  if (step.contract.write.kind === "insert" && tenantValue !== organizationId) {
    throw migrationError("MIGRATION_TENANT_NOT_CASTELO");
  }
  return payload;
}

function resultIdentity(step, result, organizationId) {
  const payload = validatePayload(step, result.payload, organizationId);
  const identity = {};
  for (const column of step.contract.cleanup.identityColumns) {
    let value = payload[column];
    if (value === undefined && step.contract.cleanup.identityColumns.length === 1) {
      value = identityFromReference(result.destinationIdentity);
    }
    if (value === undefined || value === null || value === "") {
      throw migrationError("MIGRATION_IDENTITY_INVALID");
    }
    identity[column] = value;
  }
  return identity;
}

function cleanupResultIdentity(step, result, organizationId) {
  if (result?.status === "prepared") return resultIdentity(step, result, organizationId);
  if (["not_emitted", "quarantine"].includes(result?.status)) {
    const metadata = getExecutionResultMetadata(result);
    if (isPlainObject(metadata?.cleanupIdentity)) {
      const identity = {};
      for (const column of step.contract.cleanup.identityColumns) {
        const value = metadata.cleanupIdentity[column];
        if (value === undefined || value === null || value === "") return null;
        identity[column] = value;
      }
      return identity;
    }
    if (
      step.contract.cleanup.identityColumns.length !== 1 ||
      typeof metadata?.destinationIdentity !== "string"
    ) {
      return null;
    }
    const value = identityFromReference(metadata.destinationIdentity);
    return value === undefined || value === null || value === ""
      ? null
      : { [step.contract.cleanup.identityColumns[0]]: value };
  }
  throw migrationError("MIGRATION_EXECUTION_NOT_COMPLETE");
}

function reconciliationTarget(step, payload, identity = undefined) {
  const resolvedIdentity =
    identity ??
    Object.fromEntries(
      step.contract.cleanup.identityColumns.map((column) => [column, payload[column]]),
    );
  const aggregateColumn =
    step.contract.write.kind === "replace_owned_aggregate"
      ? step.contract.cleanup.ownedColumns[0]
      : null;
  const aggregateValue = aggregateColumn === null ? null : payload[aggregateColumn];
  return Object.freeze({
    aggregateColumn,
    expectedAggregateCount: Array.isArray(aggregateValue) ? aggregateValue.length : null,
    identity: Object.freeze(resolvedIdentity),
    step,
  });
}

function buildReconciliationQuery(step) {
  const identityColumns = step.contract.cleanup.identityColumns.filter(
    (column) => column !== step.contract.tenantScope.column,
  );
  const identityMatch = identityColumns
    .map(
      (column) =>
        `target.${quoteIdentifier(column)}::text = expected.value->'identity'->>${quoteLiteral(column)}`,
    )
    .join(" AND ");
  const requiredReferences = step.requiredForeignKeys ?? [];
  const foreignKeyMismatch =
    requiredReferences.length === 0
      ? "FALSE"
      : requiredReferences
          .map(
            ({ column, targetColumn, targetTable }) =>
              `(matched.${quoteIdentifier(column)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${quoteIdentifier(targetTable)} AS referenced WHERE referenced.${quoteIdentifier(targetColumn)}::text = matched.${quoteIdentifier(column)}::text))`,
          )
          .join(" OR ");
  const aggregateColumn = step.contract.cleanup.ownedColumns[0];
  const aggregateMismatch =
    step.contract.write.kind === "replace_owned_aggregate"
      ? `jsonb_array_length(COALESCE(matched.${quoteIdentifier(aggregateColumn)}, '[]'::jsonb)) <> (matched.expected->>'expectedAggregateCount')::int`
      : "FALSE";
  return `WITH expected AS (SELECT value FROM jsonb_array_elements($1::jsonb)), matched AS (SELECT target.*, expected.value AS expected FROM ${step.tableSql} AS target JOIN expected ON ${identityMatch}) SELECT COUNT(*) FILTER (WHERE matched.${quoteIdentifier(step.contract.tenantScope.column)} = $2)::int AS persisted_count, COUNT(*) FILTER (WHERE matched.${quoteIdentifier(step.contract.tenantScope.column)} IS DISTINCT FROM $2)::int AS tenant_leak_count, COUNT(*) FILTER (WHERE matched.${quoteIdentifier(step.contract.tenantScope.column)} = $2 AND (${foreignKeyMismatch}))::int AS required_fk_mismatch_count, COUNT(*) FILTER (WHERE matched.${quoteIdentifier(step.contract.tenantScope.column)} = $2 AND (${aggregateMismatch}))::int AS aggregate_payload_mismatch_count FROM matched`;
}

function requiredForeignKeys(model, catalog) {
  const relations = [];
  for (const relation of model.fields.filter(({ relationModel }) => relationModel !== null)) {
    const target = catalog.models.find(({ prismaName }) => prismaName === relation.relationModel);
    if (target === undefined) continue;
    for (let index = 0; index < relation.relationFields.length; index += 1) {
      const source = model.fields.find(
        ({ prismaName }) => prismaName === relation.relationFields[index],
      );
      const referenced = target.fields.find(
        ({ prismaName }) => prismaName === relation.relationReferences[index],
      );
      if (source !== undefined && referenced !== undefined) {
        relations.push({
          column: source.databaseName,
          targetColumn: referenced.databaseName,
          targetTable: target.databaseName,
        });
      }
    }
  }
  return Object.freeze(relations);
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function identityFromReference(reference) {
  if (typeof reference !== "string") return undefined;
  const separator = reference.lastIndexOf(":");
  return separator === -1 ? undefined : reference.slice(separator + 1);
}

function buildAssignments(step, valuesByColumn, parameterStart) {
  const entries = Object.entries(valuesByColumn).sort(([left], [right]) =>
    compareText(left, right),
  );
  if (entries.length === 0) throw migrationError("MIGRATION_UPDATE_PAYLOAD_EMPTY");
  for (const [column] of entries) {
    if (!step.fields.has(column)) throw migrationError("MIGRATION_SQL_IDENTIFIER_NOT_IN_CATALOG");
  }
  return {
    sql: entries
      .map(([column], index) => `${quoteIdentifier(column)} = $${parameterStart + index}`)
      .join(", "),
    values: entries.map(([column, value]) => normalizeWriteValue(step, column, value)),
  };
}

function normalizeWriteValue(step, column, value) {
  if (value === null || value === undefined || !step?.jsonColumns?.has(column)) return value;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildWhere(step, identity, organizationId, parameterStart) {
  const valuesByColumn = { ...identity, [step.contract.tenantScope.column]: organizationId };
  const entries = Object.entries(valuesByColumn).sort(([left], [right]) =>
    compareText(left, right),
  );
  return {
    sql: entries
      .map(([column], index) => `${quoteIdentifier(column)} = $${parameterStart + index}`)
      .join(" AND "),
    values: entries.map(([, value]) => value),
  };
}

function buildBatchDeleteWhere(step, identities, organizationId) {
  const values = [organizationId];
  const clauses = identities.map((identity) => {
    const entries = Object.entries(identity)
      .filter(([column]) => column !== step.contract.tenantScope.column)
      .sort(([left], [right]) => compareText(left, right));
    if (entries.length === 0) throw migrationError("MIGRATION_IDENTITY_INVALID");
    const predicates = entries.map(([column], index) => {
      values.push(identity[column]);
      return `${quoteIdentifier(column)} = $${values.length}`;
    });
    return `(${predicates.join(" AND ")})`;
  });
  return {
    sql: `${quoteIdentifier(step.contract.tenantScope.column)} = $1 AND (${clauses.join(" OR ")})`,
    values,
  };
}

async function insertRows(client, step, columns, rows, options = {}) {
  if (!Array.isArray(columns) || columns.length === 0 || rows.length === 0) {
    throw migrationError("MIGRATION_INSERT_PAYLOAD_INVALID");
  }
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(normalizeWriteValue(step, column, row[column]));
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const identityColumns = step.contract.cleanup.identityColumns;
  const useReturning = options.onConflictDoNothing === true && identityColumns.length > 0;
  const suffix = options.onConflictDoNothing === true ? " ON CONFLICT DO NOTHING" : "";
  const returning = useReturning
    ? ` RETURNING ${identityColumns.map(quoteIdentifier).join(", ")}`
    : "";
  let result;
  try {
    result = await client.query(
      `INSERT INTO ${step.tableSql} (${columns.map(quoteIdentifier).join(", ")}) VALUES ${tuples.join(", ")}${suffix}${returning}`,
      values,
    );
  } catch (error) {
    if (error?.code === "23503" || error?.code === "22P02") {
      error.details = {
        stepKey: step.key,
        sourceTable: step.sourceTable,
        stepId: step.stepId,
        destinationTable: step.destinationTable,
        columns,
        sampleRows: rows.slice(0, 5).map((row) => ({
          id: row.id ?? null,
          user_id: row.user_id ?? null,
          client_id: row.client_id ?? null,
          responsible_id: row.responsible_id ?? null,
          responsible2_id: row.responsible2_id ?? null,
          responsible3_id: row.responsible3_id ?? null,
          department_id: row.department_id ?? null,
        })),
        userIds: [...new Set(rows.map((row) => row.user_id).filter((value) => value != null))],
      };
    }
    throw error;
  }
  if (result.rowCount > rows.length) {
    throw migrationError("MIGRATION_INSERT_ROW_COUNT_MISMATCH");
  }
  if (!useReturning) {
    return { writes: result.rowCount ?? 0, insertedRows: rows };
  }
  if (!Array.isArray(result.rows)) {
    throw migrationError("MIGRATION_INSERT_RECONCILIATION_UNAVAILABLE");
  }
  const insertedKeys = new Set(
    result.rows.map((row) => identityKey(row, identityColumns)),
  );
  return {
    writes: result.rowCount ?? 0,
    insertedRows: rows.filter((row) => insertedKeys.has(identityKey(row, identityColumns))),
  };
}

function identityKey(value, columns) {
  return JSON.stringify(columns.map((column) => value?.[column] ?? null));
}

function assertOwnedUpdate(step, valuesToWrite) {
  const columns = Object.keys(valuesToWrite);
  if (
    columns.length === 0 ||
    columns.some((column) => !step.contract.cleanup.ownedColumns.includes(column))
  ) {
    throw migrationError("MIGRATION_UPDATE_COLUMNS_NOT_OWNED", {
      stepKey: step.key,
      sourceTable: step.sourceTable,
      stepId: step.stepId,
      destinationTable: step.destinationTable,
      columns,
      ownedColumns: step.contract.cleanup.ownedColumns,
    });
  }
  if (
    step.contract.write.kind === "replace_owned_aggregate" &&
    !sameColumns(columns, step.contract.cleanup.ownedColumns)
  ) {
    throw migrationError("MIGRATION_AGGREGATE_COLUMN_MISMATCH");
  }
}

function assertExactlyOne(result, code) {
  if (result?.rowCount !== 1) throw migrationError(code);
}

function sameDestinationCounts(actual, expected) {
  if (!isPlainObject(actual) || !isPlainObject(expected)) return false;
  const destinations = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const destination of destinations) {
    if ((actual[destination] ?? 0) !== expected[destination]?.prepared) return false;
  }
  return true;
}

function sameColumns(left, right) {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function migrationError(code, details = undefined) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

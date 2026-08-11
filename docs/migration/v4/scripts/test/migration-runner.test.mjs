import assert from "node:assert/strict";
import test from "node:test";

import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import {
  cleanupMappedData,
  loadMappedData,
  orderMigrationSteps,
  reconcileMappedData,
  runMigration,
} from "../lib/migration-runner.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { createCompleteExecutionRegistry } from "../runtime/index.mjs";

function createFakeClient() {
  const transactionEvents = [];
  return {
    transactionEvents,
    async query(sql) {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) transactionEvents.push(sql);
      return { rowCount: 1, rows: [] };
    },
  };
}

function catalog() {
  return {
    models: [
      {
        databaseName: "records",
        fields: [
          { databaseName: "id", relationModel: null },
          { databaseName: "organization_id", relationModel: null },
          { databaseName: "name", relationModel: null },
          { databaseName: "legacy_name", relationModel: null },
          { databaseName: "protected_name", relationModel: null },
          { databaseName: "legacy_items", relationModel: null },
        ],
      },
    ],
  };
}

function step(stepId, writeKind, cleanup) {
  return {
    key: `legacy.source\0${stepId}`,
    sourceTable: "legacy.source",
    stepId,
    destinationTable: "records",
    contract: {
      tenantScope: {
        kind: "organization_column",
        column: "organization_id",
        organizationId: CASTELO_ORGANIZATION_ID,
      },
      write: { kind: writeKind },
      cleanup,
    },
  };
}

function session(resultsByKey) {
  return {
    async *iterateStep(key) {
      yield* resultsByKey.get(key) ?? [];
    },
  };
}

function prepared(payload, destinationIdentity) {
  return { status: "prepared", payload, destinationIdentity };
}

function defaultOperationFixture(client = createSqlClient()) {
  const insert = step("insert", "insert", {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  });
  const merge = step("merge", "update_exactly_one", {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns: ["id", "legacy_name"],
    resetValues: { id: null, legacy_name: null },
  });
  const aggregate = step("aggregate", "replace_owned_aggregate", {
    kind: "replace_owned_aggregate",
    identityColumns: ["id"],
    ownedColumns: ["legacy_items"],
    resetValues: { legacy_items: null },
  });
  const lookup = step("lookup", "none", {
    kind: "none",
    identityColumns: [],
    ownedColumns: [],
    resetValues: {},
  });
  const payloads = new Map([
    [
      insert.key,
      [
        prepared({
          id: "insert-1",
          organization_id: CASTELO_ORGANIZATION_ID,
          name: "Robert'); DROP TABLE records; --",
        }),
      ],
    ],
    [
      merge.key,
      [
        prepared({
          id: "merge-1",
          organization_id: CASTELO_ORGANIZATION_ID,
          legacy_name: "novo",
        }),
      ],
    ],
    [aggregate.key, [prepared({ legacy_items: [{ id: "child-1" }] }, "records:aggregate-1")]],
    [lookup.key, [prepared({}, "records:lookup-1")]],
  ]);
  const steps = [insert, merge, aggregate, lookup];
  return {
    client,
    plan: { catalog: catalog(), cleanupSession: session(payloads), steps },
    executionSession: session(payloads),
    dryRunReport: {
      complete: true,
      writesPerformed: false,
      expectedWrites: 3,
      destinationCounts: { records: { prepared: 4 } },
    },
    snapshotManifest: { restorable: true },
    organizationId: CASTELO_ORGANIZATION_ID,
    batchSize: 500,
  };
}

function createSqlClient({ rowCount = () => 1 } = {}) {
  const queries = [];
  const transactionEvents = [];
  return {
    queries,
    transactionEvents,
    async query(sql, values = []) {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
        transactionEvents.push(sql);
        return { rowCount: null, rows: [] };
      }
      queries.push({ sql, values });
      if (sql.startsWith("WITH expected AS")) {
        return {
          rowCount: 1,
          rows: [
            {
              aggregate_payload_mismatch_count: 0,
              persisted_count: JSON.parse(values[0]).length,
              required_fk_mismatch_count: 0,
              tenant_leak_count: 0,
            },
          ],
        };
      }
      return { rowCount: rowCount(sql, values), rows: [] };
    },
  };
}

function validOptions(client, { failOn } = {}) {
  return {
    client,
    plan: { steps: [] },
    executionSession: {},
    dryRunReport: { complete: true, writesPerformed: false },
    snapshotManifest: { restorable: true },
    organizationId: CASTELO_ORGANIZATION_ID,
    batchSize: 500,
    operations: {
      cleanup: async () => {
        if (failOn === "cleanup") throw new Error("CLEANUP_FAILED");
      },
      load: async () => {
        if (failOn === "load") throw new Error("LOAD_FAILED");
      },
      reconcile: async () => {
        if (failOn === "reconcile") throw new Error("RECONCILE_FAILED");
      },
    },
  };
}

test("load failure rolls back cleanup", async () => {
  const client = createFakeClient();

  await assert.rejects(runMigration(validOptions(client, { failOn: "load" })), /LOAD_FAILED/);

  assert.deepEqual(client.transactionEvents, ["BEGIN", "ROLLBACK"]);
});

test("cleanup, load and reconciliation commit in the same transaction", async () => {
  const client = createFakeClient();
  const operationEvents = [];
  const options = validOptions(client);
  options.operations = {
    cleanup: async () => operationEvents.push("cleanup"),
    load: async () => operationEvents.push("load"),
    reconcile: async () => operationEvents.push("reconcile"),
  };

  await runMigration(options);

  assert.deepEqual(operationEvents, ["cleanup", "load", "reconcile"]);
  assert.deepEqual(client.transactionEvents, ["BEGIN", "COMMIT"]);
});

test("modo incremental pode pular cleanup sem pular carga e reconciliação", async () => {
  const client = createFakeClient();
  const operationEvents = [];
  const options = validOptions(client);
  options.skipCleanup = true;
  options.operations = {
    cleanup: async () => operationEvents.push("cleanup"),
    load: async () => operationEvents.push("load"),
    reconcile: async () => operationEvents.push("reconcile"),
  };

  await runMigration(options);

  assert.deepEqual(operationEvents, ["load", "reconcile"]);
  assert.deepEqual(client.transactionEvents, ["BEGIN", "COMMIT"]);
});

test("reconciliation failure rolls back cleanup and load", async () => {
  const client = createFakeClient();

  await assert.rejects(
    runMigration(validOptions(client, { failOn: "reconcile" })),
    /RECONCILE_FAILED/,
  );

  assert.deepEqual(client.transactionEvents, ["BEGIN", "ROLLBACK"]);
});

test("default operations clean, load and reconcile every mode with parameterized Castelo SQL", async () => {
  const options = defaultOperationFixture();

  const result = await runMigration(options);

  assert.deepEqual(options.client.transactionEvents, ["BEGIN", "COMMIT"]);
  assert.equal(options.client.queries.length, 9);
  assert.equal(result.load.prepared, 4);
  assert.equal(result.load.writes, 3);
  assert.equal(result.reconciliation.matches, true);
  assert.equal(
    options.client.queries.some(({ sql }) => sql.includes("DROP TABLE")),
    false,
  );
  assert.equal(
    options.client.queries.some(({ values }) =>
      values.includes("Robert'); DROP TABLE records; --"),
    ),
    true,
  );
  const cleanupUpdates = options.client.queries.filter(({ sql }) =>
    sql.startsWith('UPDATE "records" SET'),
  );
  const legacyNameCleanup = cleanupUpdates.find(({ sql }) => sql.includes('"legacy_name"'));
  assert.match(legacyNameCleanup.sql, /"legacy_name" = \$\d+/);
  assert.doesNotMatch(legacyNameCleanup.sql.split(" WHERE ")[0], /"id" =/);
  assert.doesNotMatch(legacyNameCleanup.sql, /protected_name/);
  assert.equal(cleanupUpdates.filter(({ sql }) => sql.includes('"legacy_items" = $1')).length, 2);
  for (const { sql, values } of options.client.queries) {
    assert.match(sql, /"records"/);
    assert.match(sql, /"organization_id"/);
    assert.equal(values.includes(CASTELO_ORGANIZATION_ID), true);
  }
});

test("insert load splits 501 prepared rows into batches of at most 500", async () => {
  const insert = step("batch-insert", "insert", {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  });
  const results = Array.from({ length: 501 }, (_, index) =>
    prepared({
      id: `id-${index}`,
      organization_id: CASTELO_ORGANIZATION_ID,
      name: `row-${index}`,
    }),
  );
  const client = createSqlClient({
    rowCount: (sql, values) => (sql.startsWith("INSERT") ? values.length / 3 : 1),
  });

  const result = await runMigration({
    ...defaultOperationFixture(client),
    plan: { catalog: catalog(), cleanupSession: session(new Map()), steps: [insert] },
    executionSession: session(new Map([[insert.key, results]])),
    dryRunReport: {
      complete: true,
      writesPerformed: false,
      expectedWrites: 501,
      destinationCounts: { records: { prepared: 501 } },
    },
  });

  const inserts = client.queries.filter(({ sql }) => sql.startsWith("INSERT"));
  assert.equal(inserts.length, 2);
  assert.deepEqual(
    inserts.map(({ values }) => values.length / 3),
    [500, 1],
  );
  assert.equal(result.load.writes, 501);
});

test("duplicate insert reconciliation validates only rows actually inserted", async () => {
  const insert = step("duplicate-aware-insert", "insert", {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  });
  const client = {
    queries: [],
    async query(sql, values = []) {
      this.queries.push({ sql, values });
      if (sql.startsWith("INSERT")) {
        return { rowCount: 1, rows: [{ id: "inserted" }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await loadMappedData(
    client,
    session(
      new Map([
        [
          insert.key,
          [
            prepared({
              id: "inserted",
              organization_id: CASTELO_ORGANIZATION_ID,
              name: "novo",
            }),
            prepared({
              id: "already-present",
              organization_id: CASTELO_ORGANIZATION_ID,
              name: "duplicado",
            }),
          ],
        ],
      ]),
    ),
    CASTELO_ORGANIZATION_ID,
    500,
    {
      catalog: catalog(),
      steps: [insert],
      skipDuplicateInserts: true,
    },
  );

  assert.equal(result.prepared, 2);
  assert.equal(result.writes, 1);
  assert.deepEqual(
    result.reconciliationTargets.map(({ identity }) => identity),
    [{ id: "inserted" }],
  );
  assert.match(client.queries[0].sql, /ON CONFLICT DO NOTHING RETURNING "id"/);
});

test("merge update affecting zero rows rolls back", async () => {
  const merge = step("missing-merge", "update_exactly_one", {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns: ["legacy_name"],
    resetValues: { legacy_name: null },
  });
  const client = createSqlClient({
    rowCount: (sql) => (sql.includes('"legacy_name" = $1') ? 0 : 1),
  });

  await assert.rejects(
    runMigration({
      ...defaultOperationFixture(client),
      plan: { catalog: catalog(), cleanupSession: session(new Map()), steps: [merge] },
      executionSession: session(
        new Map([
          [
            merge.key,
            [
              prepared({
                id: "missing",
                organization_id: CASTELO_ORGANIZATION_ID,
                legacy_name: "novo",
              }),
            ],
          ],
        ]),
      ),
      dryRunReport: {
        complete: true,
        writesPerformed: false,
        expectedWrites: 1,
        destinationCounts: { records: { prepared: 1 } },
      },
    }),
    /MIGRATION_UPDATE_ROW_COUNT_MISMATCH/,
  );

  assert.deepEqual(client.transactionEvents, ["BEGIN", "ROLLBACK"]);
});

test("merge update can quarantine a missing destination when partial apply allows it", async () => {
  const merge = step("missing-merge-quarantine", "update_exactly_one", {
    kind: "reset_owned_columns",
    identityColumns: ["id"],
    ownedColumns: ["legacy_name"],
    resetValues: { legacy_name: null },
  });
  const client = createSqlClient({
    rowCount: (sql) => (sql.includes('"legacy_name" = $1') ? 0 : 1),
  });

  const result = await loadMappedData(
    client,
    session(
      new Map([
        [
          merge.key,
          [
            prepared({
              id: "missing",
              organization_id: CASTELO_ORGANIZATION_ID,
              legacy_name: "novo",
            }),
          ],
        ],
      ]),
    ),
    CASTELO_ORGANIZATION_ID,
    500,
    {
      catalog: catalog(),
      steps: [merge],
      skipMissingMergeTargets: true,
    },
  );

  assert.equal(result.prepared, 1);
  assert.equal(result.writes, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.reconciliationTargets, []);
});

test("reconciliation mismatch rolls back the complete transaction", async () => {
  const options = defaultOperationFixture();
  options.dryRunReport.expectedWrites = 5;

  await assert.rejects(runMigration(options), /MIGRATION_RECONCILIATION_MISMATCH/);

  assert.deepEqual(options.client.transactionEvents, ["BEGIN", "ROLLBACK"]);
});

test("runner rejects another tenant before opening a transaction", async () => {
  const options = defaultOperationFixture();
  options.organizationId = "00000000-0000-0000-0000-000000000000";

  await assert.rejects(runMigration(options), /MIGRATION_TENANT_NOT_CASTELO/);

  assert.deepEqual(options.client.transactionEvents, []);
});

test("runner rejects a dry-run report that performed writes before opening a transaction", async () => {
  const options = defaultOperationFixture();
  options.dryRunReport.writesPerformed = true;

  await assert.rejects(runMigration(options), /MIGRATION_DRY_RUN_NOT_ACCEPTED/);

  assert.deepEqual(options.client.transactionEvents, []);
});

test("runner accepts incomplete dry-run report when partial migration is enabled", async () => {
  const options = defaultOperationFixture();
  options.dryRunReport.complete = false;
  options.allowPartial = true;

  const result = await runMigration(options);

  assert.equal(result.mode, "apply");
  assert.equal(result.writesPerformed, true);
});

test("runner accepts every validated production step without widening its catalog", async () => {
  const client = createSqlClient();
  const registry = createCompleteExecutionRegistry();
  const prismaCatalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  const emptySession = session(new Map());
  const steps = [...registry].map(([key, entry]) => ({
    key,
    sourceTable: entry.sourceTable,
    stepId: entry.stepId,
    destinationTable: entry.destinationTable,
    contract: entry.contract,
  }));

  const result = await runMigration({
    client,
    plan: { catalog: prismaCatalog, cleanupSession: emptySession, steps },
    executionSession: emptySession,
    dryRunReport: {
      complete: true,
      writesPerformed: false,
      expectedWrites: 0,
      destinationCounts: {},
    },
    snapshotManifest: { restorable: true },
    organizationId: CASTELO_ORGANIZATION_ID,
    batchSize: 500,
  });

  assert.equal(steps.length, 133);
  assert.equal(result.writesPerformed, false);
  assert.deepEqual(client.transactionEvents, ["BEGIN", "COMMIT"]);
  assert.deepEqual(client.queries, []);
});

test("cleanup usa ordem topológica reversa e load usa ordem direta", () => {
  const parent = { key: "parent", sourceTable: "legacy.departments", dependencies: [] };
  const child = {
    key: "child",
    sourceTable: "legacy.users",
    dependencies: ["legacy.departments"],
  };
  const aggregate = {
    key: "aggregate",
    sourceTable: "legacy.allergies",
    dependencies: ["legacy.users"],
    destinationTable: "users",
  };

  assert.deepEqual(
    orderMigrationSteps([child, aggregate, parent], "load").map(({ key }) => key),
    ["parent", "child", "aggregate"],
  );
  assert.deepEqual(
    orderMigrationSteps([child, aggregate, parent], "cleanup").map(({ key }) => key),
    ["aggregate", "child", "parent"],
  );
});

test("cleanup agrupa exclusões por identidade em uma consulta", async () => {
  const insert = step("batched-delete", "insert", {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  });
  const client = {
    queries: [],
    async query(sql, values = []) {
      this.queries.push({ sql, values });
      return { rowCount: 3, rows: [] };
    },
  };
  const results = ["one", "two", "three"].map((id) =>
    prepared({ id, organization_id: CASTELO_ORGANIZATION_ID, name: id }),
  );

  const result = await cleanupMappedData(
    client,
    {
      catalog: catalog(),
      cleanupSession: session(new Map([[insert.key, results]])),
      steps: [insert],
    },
    CASTELO_ORGANIZATION_ID,
  );

  assert.equal(result.targets, 3);
  assert.equal(result.writes, 3);
  assert.equal(client.queries.length, 1);
  assert.match(client.queries[0].sql, /DELETE FROM "records"/);
  assert.match(client.queries[0].sql, / OR /);
});

test("cleanup rejeita identidade pública artificial em not_emitted", async () => {
  const insert = step("reload", "insert", {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  });
  const client = createSqlClient();
  await cleanupMappedData(
    client,
    {
      catalog: catalog(),
      cleanupSession: session(
        new Map([[insert.key, [{ status: "not_emitted", cleanupIdentity: { id: "legacy-old" } }]]]),
      ),
      steps: [insert],
    },
    CASTELO_ORGANIZATION_ID,
  );

  assert.equal(client.queries.length, 0);
});

test("reconciliação consulta persistência e rejeita mismatch do banco", async () => {
  const exactClient = createSqlClient();
  exactClient.query = async (sql, values = []) => {
    exactClient.queries.push({ sql, values });
    return {
      rowCount: 1,
      rows: [
        {
          aggregate_payload_mismatch_count: 0,
          persisted_count: 1,
          required_fk_mismatch_count: 0,
          tenant_leak_count: 0,
        },
      ],
    };
  };
  const target = {
    aggregateColumn: "legacy_items",
    expectedAggregateCount: 1,
    identity: { id: "row-1" },
    step: {
      ...step("aggregate-db", "replace_owned_aggregate", {
        kind: "replace_owned_aggregate",
        identityColumns: ["id"],
        ownedColumns: ["legacy_items"],
        resetValues: { legacy_items: null },
      }),
      fields: new Set(["id", "organization_id", "legacy_items"]),
      tableSql: '"records"',
    },
  };
  const report = {
    complete: true,
    writesPerformed: false,
    expectedWrites: 1,
    destinationCounts: { records: { prepared: 1 } },
  };
  const context = {
    loadResult: {
      destinationCounts: { records: 1 },
      prepared: 1,
      reconciliationTargets: [target],
      writes: 1,
    },
  };

  const result = await reconcileMappedData(exactClient, report, CASTELO_ORGANIZATION_ID, context);
  assert.equal(result.databaseQueries, 1);
  assert.match(exactClient.queries[0].sql, /jsonb_array_elements/);

  const mismatchClient = {
    query: async () => ({
      rows: [
        {
          aggregate_payload_mismatch_count: 1,
          persisted_count: 1,
          required_fk_mismatch_count: 0,
          tenant_leak_count: 0,
        },
      ],
    }),
  };
  await assert.rejects(
    reconcileMappedData(mismatchClient, report, CASTELO_ORGANIZATION_ID, context),
    /MIGRATION_RECONCILIATION_MISMATCH/,
  );
});

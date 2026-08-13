import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDryRun } from "../dry-run.mjs";
import { createCompleteExecutionRegistry } from "../runtime/index.mjs";

const inventory = JSON.parse(
  await readFile(new URL("../../reports/source-inventory.json", import.meta.url), "utf8"),
);
const pendingMappings = JSON.parse(
  await readFile(new URL("../../pending-mapping/tables.json", import.meta.url), "utf8"),
);
const confirmedScope = {
  sources: inventory.tables.filter(
    ({ sourceTable }) => !pendingMappings.some((pending) => pending.sourceTable === sourceTable),
  ),
};

test("dry-run accounts for all frozen sources without storing payloads", async () => {
  const executionRegistry = createCompleteExecutionRegistry();
  const inventoryBySource = new Map(inventory.tables.map((table) => [table.sourceTable, table]));
  const firstStepBySource = new Map();
  for (const [key, entry] of executionRegistry) {
    if (!firstStepBySource.has(entry.sourceTable)) firstStepBySource.set(entry.sourceTable, key);
  }
  const createSession = async () => ({
    async *iterateStep(key) {
      const entry = executionRegistry.get(key);
      const rowCount = inventoryBySource.get(entry.sourceTable).rowCount;
      if (firstStepBySource.get(entry.sourceTable) === key && rowCount > 0) {
        yield {
          sourceTable: entry.sourceTable,
          stepId: entry.stepId,
          status: "prepared",
          destinationIdentity: `${entry.destinationTable}:sanitized`,
          sourceRowCount: rowCount,
          payload: { forbiddenRawPayload: "SENTINEL" },
        };
      }
    },
  });

  const report = await runDryRun({
    inventory,
    confirmedScope,
    executionRegistry,
    pendingMappings,
    createSession,
  });

  assert.deepEqual(report.inventoryCounts, {
    executableSources: 103,
    pendingSources: 209,
    sources: 312,
    steps: 133,
    rows: 1_374_880,
  });
  assert.deepEqual(report.sourceCounts, {
    notEmitted: 0,
    prepared: 629_349,
    quarantine: 745_531,
  });
  assert.equal(report.quarantine.length, pendingMappings.length);
  assert.equal(report.complete, false);
  assert.doesNotMatch(JSON.stringify(report), /forbiddenRawPayload|SENTINEL|payload/i);
});

test("intentional not-preserved pending source is counted as quarantine", async () => {
  const report = await runDryRun({
    inventory: {
      tables: [{ sourceTable: "legacy.retired", rowCount: 1_374_880 }],
    },
    confirmedScope: { sources: [] },
    executionRegistry: new Map(),
    pendingMappings: [
      {
        sourceTable: "legacy.retired",
        sourceRowCount: 1_374_880,
        status: "not_preserved",
        reasonCode: "INTENTIONALLY_NOT_PRESERVED",
        reason: "Origem aposentada por decisão explícita.",
      },
    ],
    createSession: async () => ({
      async *iterateStep() {},
    }),
  });

  assert.deepEqual(report.sourceCounts, {
    notEmitted: 0,
    prepared: 0,
    quarantine: 1_374_880,
  });
  assert.equal(report.complete, false);
});

test("executable quarantines are grouped deterministically with bounded digest samples", async () => {
  const executable = {
    sourceTable: "legacy.invalid",
    stepId: "insert",
    destinationTable: "destination.invalid",
  };
  const digests = Array.from(
    { length: 25 },
    (_, index) => `sha256:${String(24 - index).padStart(64, "0")}`,
  );
  const options = {
    inventory: {
      tables: [
        { sourceTable: executable.sourceTable, rowCount: 25 },
        { sourceTable: "legacy.pending", rowCount: 1_374_855 },
      ],
    },
    confirmedScope: { sources: [{ sourceTable: executable.sourceTable }] },
    executionRegistry: new Map([[`${executable.sourceTable}\0${executable.stepId}`, executable]]),
    pendingMappings: [
      {
        sourceTable: "legacy.pending",
        sourceRowCount: 1_374_855,
        status: "pending",
        reasonCode: "NO_CURRENT_CONTRACT",
        reason: "Não deve ser serializado.",
      },
    ],
  };
  const execute = (orderedDigests) =>
    runDryRun({
      ...options,
      createSession: async () => ({
        async *iterateStep() {
          for (const sourceIdentityDigest of orderedDigests) {
            yield {
              ...executable,
              status: "quarantine",
              sourceIdentityDigest,
              field: "reference_id",
              reasonCode: "REFERENCE_NOT_FOUND",
            };
          }
        },
      }),
    });

  const report = await execute(digests);
  const reversed = await execute([...digests].reverse());

  assert.deepEqual(report, reversed);
  assert.deepEqual(report.quarantine[0], {
    sourceTable: "legacy.invalid",
    stepId: "insert",
    destinationTable: "destination.invalid",
    field: "reference_id",
    reasonCode: "REFERENCE_NOT_FOUND",
    rowCount: 25,
    sourceIdentityDigests: [...digests].sort().slice(0, 20),
  });
  assert.equal(report.quarantine.length, 2);
  assert.equal(report.sourceCounts.quarantine, 1_374_880);
  assert.ok(JSON.stringify(report).length < 10_000);
});

test("quarantine in a later step blocks completion without double-counting source rows", async () => {
  const sourceTable = "legacy.multistep";
  const executionRegistry = new Map([
    [
      `${sourceTable}\0first`,
      {
        sourceTable,
        stepId: "first",
        destinationTable: "destination.first",
        contract: { write: { kind: "insert" } },
      },
    ],
    [
      `${sourceTable}\0second`,
      {
        sourceTable,
        stepId: "second",
        destinationTable: "destination.second",
        contract: { write: { kind: "insert" } },
      },
    ],
  ]);

  const report = await runDryRun({
    inventory: { tables: [{ sourceTable, rowCount: 1_374_880 }] },
    confirmedScope: { sources: [{ sourceTable }] },
    executionRegistry,
    pendingMappings: [],
    createSession: async () => ({
      async *iterateStep(key) {
        if (key.endsWith("\0first")) {
          yield {
            status: "prepared",
            sourceRowCount: 1_374_880,
          };
          return;
        }
        yield {
          status: "quarantine",
          field: "status",
          reasonCode: "SECOND_STEP_INVALID",
          sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
        };
      },
    }),
  });

  assert.deepEqual(report.sourceCounts, {
    notEmitted: 0,
    prepared: 1_374_879,
    quarantine: 1,
  });
  assert.equal(report.statusCounts.quarantine, 1);
  assert.equal(report.complete, false);
});

test("writes excluem lookup e são separados em insert, update e aggregate", async () => {
  const sourceTable = "legacy.metrics";
  const executionRegistry = new Map([
    [
      `${sourceTable}\0lookup`,
      {
        sourceTable,
        stepId: "lookup",
        destinationTable: "destination.lookup",
        contract: { write: { kind: "none" } },
      },
    ],
    [
      `${sourceTable}\0aggregate`,
      {
        sourceTable,
        stepId: "aggregate",
        destinationTable: "destination.aggregate",
        contract: { write: { kind: "replace_owned_aggregate" } },
      },
    ],
  ]);
  const report = await runDryRun({
    inventory: { tables: [{ sourceTable, rowCount: 1_374_880 }] },
    confirmedScope: { sources: [{ sourceTable }] },
    executionRegistry,
    pendingMappings: [],
    createSession: async () => ({
      async *iterateStep() {
        yield { status: "prepared", sourceRowCount: 1_374_880 };
      },
    }),
  });

  assert.equal(report.expectedWrites, 1);
  assert.deepEqual(report.expectedWriteCounts, {
    aggregate: 1,
    insert: 0,
    update: 0,
  });
});

test("dry-run rejects source overlap between executable and pending mappings", async () => {
  await assert.rejects(
    () =>
      runDryRun({
        inventory: { tables: [{ sourceTable: "legacy.shared", rowCount: 1 }] },
        confirmedScope: { sources: [{ sourceTable: "legacy.shared" }] },
        executionRegistry: new Map([
          [
            "legacy.shared\0insert",
            {
              sourceTable: "legacy.shared",
              stepId: "insert",
              destinationTable: "destination.shared",
            },
          ],
        ]),
        pendingMappings: [
          {
            sourceTable: "legacy.shared",
            sourceRowCount: 1,
            status: "pending",
            reasonCode: "NO_CURRENT_CONTRACT",
            reason: "Sem contrato.",
          },
        ],
        createSession: async () => ({ async *iterateStep() {} }),
      }),
    /DRY_RUN_SOURCE_OVERLAP/,
  );
});

test("unexpected runtime callback failure aborts dry-run without leaking data", async () => {
  const executionRegistry = new Map([
    [
      "legacy.failed\0insert",
      {
        sourceTable: "legacy.failed",
        stepId: "insert",
        destinationTable: "destination.failed",
      },
    ],
    [
      "legacy.ok\0insert",
      {
        sourceTable: "legacy.ok",
        stepId: "insert",
        destinationTable: "destination.ok",
      },
    ],
  ]);
  const callbackError = new Error("cpf=123.456.789-09");
  callbackError.code = "EXECUTION_CALLBACK_FAILED";
  let laterStepRan = false;

  await assert.rejects(
    () =>
      runDryRun({
        inventory: {
          tables: [
            { sourceTable: "legacy.failed", rowCount: 1_374_879 },
            { sourceTable: "legacy.ok", rowCount: 1 },
          ],
        },
        confirmedScope: {
          sources: [{ sourceTable: "legacy.failed" }, { sourceTable: "legacy.ok" }],
        },
        executionRegistry,
        pendingMappings: [],
        createSession: async () => ({
          async *iterateStep(key) {
            if (key === "legacy.failed\0insert") throw callbackError;
            laterStepRan = true;
            yield {
              sourceTable: "legacy.ok",
              stepId: "insert",
              status: "prepared",
              destinationIdentity: "destination.ok:1",
            };
          },
        }),
      }),
    (error) => {
      assert.equal(error.code, "EXECUTION_CALLBACK_FAILED");
      assert.doesNotMatch(error.message, /cpf|123\.456/i);
      return true;
    },
  );
  assert.equal(laterStepRan, false);
});

test("modo rápido não agrega identidades de quarantine por grupo", async () => {
  const sourceTable = "legacy.fast_mode";
  const report = await runDryRun({
    inventory: { tables: [{ sourceTable, rowCount: 2 }] },
    confirmedScope: { sources: [{ sourceTable }] },
    executionRegistry: new Map([
      [
        `${sourceTable}\0insert`,
        {
          sourceTable,
          stepId: "insert",
          destinationTable: "destination.quick",
          contract: { write: { kind: "insert" } },
        },
      ],
    ]),
    pendingMappings: [],
    fastMode: true,
    createSession: async () => ({
      async *iterateStep() {
        yield {
          ...{ sourceTable, stepId: "insert" },
          status: "quarantine",
          sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
          sourceRowCount: 2,
          reasonCode: "REFERENCE_NOT_FOUND",
        };
      },
    }),
  });

  assert.deepEqual(report.quarantine, []);
  assert.equal(report.statusCounts.quarantine, 2);
  assert.equal(report.sourceCounts.quarantine, 2);
  assert.equal(report.blockers.quarantine, 2);
  assert.equal(report.complete, false);
});

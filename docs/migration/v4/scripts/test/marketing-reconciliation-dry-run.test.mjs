import assert from "node:assert/strict";
import test from "node:test";

import { MIGRATION_ORGANIZATION_ID, runConfiguredDryRun, runDryRun } from "../dry-run.mjs";

test("configured Marketing dry-run rejects tenants other than its mapped organization", async () => {
  assert.equal(MIGRATION_ORGANIZATION_ID, "e8048d1c-0830-45d7-84de-68e20abd685b");
  await assert.rejects(
    runConfiguredDryRun({
      sourceDir: "unused-for-rejected-tenant",
      organizationId: "10000000-0000-4000-8000-000000000001",
    }),
    { code: "DRY_RUN_TENANT_NOT_SUPPORTED" },
  );
});

test("dry-run itemizes every opted-in Marketing quarantine without source payload", async () => {
  const sourceTable = "tb_mkt.eventos_edicoes";
  const executable = {
    sourceTable,
    stepId: "edition-insert",
    destinationTable: "marketing.event_editions",
  };
  const digests = Array.from(
    { length: 25 },
    (_, index) => `sha256:${String(index).padStart(64, "0")}`,
  );
  const report = await runDryRun({
    inventory: {
      tables: [
        { sourceTable, rowCount: 25 },
        { sourceTable: "legacy.pending", rowCount: 1_374_855 },
      ],
    },
    confirmedScope: { sources: [{ sourceTable }] },
    executionRegistry: new Map([[`${sourceTable}\0edition-insert`, executable]]),
    pendingMappings: [
      {
        sourceTable: "legacy.pending",
        sourceRowCount: 1_374_855,
        status: "pending",
        reasonCode: "NO_CURRENT_CONTRACT",
        reason: "Não deve ser serializado.",
      },
    ],
    itemizedSourceTables: [sourceTable],
    createSession: async () => ({
      async *iterateStep() {
        for (const sourceIdentityDigest of digests) {
          yield {
            ...executable,
            status: "quarantine",
            sourceIdentityDigest,
            field: "evento_id",
            reasonCode: "MKT_EDITION_EVENT_AMBIGUOUS",
            payload: { secret: "do-not-serialize" },
          };
        }
      },
    }),
  });

  assert.equal(report.quarantineItems.length, 25);
  assert.deepEqual(report.quarantineItems[0], {
    sourceTable,
    stepId: "edition-insert",
    sourceIdentityDigest: digests[0],
    field: "evento_id",
    reasonCode: "MKT_EDITION_EVENT_AMBIGUOUS",
  });
  assert.doesNotMatch(JSON.stringify(report.quarantineItems), /do-not-serialize|secret|payload/i);
});

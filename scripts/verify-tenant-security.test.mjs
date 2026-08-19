import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_QUERY,
  auditCatalog,
  runCli,
  validateInventory,
} from "./verify-tenant-security.mjs";

test("validateInventory rejeita classificações e responsáveis inválidos", () => {
  assert.throws(
    () => validateInventory([{ table: "rh.requests", classification: "tenant", owningServices: [] }]),
    /owningServices/,
  );
  assert.throws(
    () =>
      validateInventory([
        { table: "users", classification: "unknown", owningServices: ["user-service"] },
      ]),
    /classification/,
  );
});

test("auditCatalog retorna somente metadados de catálogo para cada tabela inventariada", () => {
  const report = auditCatalog(
    [
      { table: "organizations", classification: "global", owningServices: ["organization-service"] },
      { table: "rh.requests", classification: "tenant", owningServices: ["rh-service"] },
    ],
    [
      { table_name: "organizations", relrowsecurity: false, relforcerowsecurity: false },
      { table_name: "rh.requests", relrowsecurity: false, relforcerowsecurity: false },
    ],
  );

  assert.deepEqual(report, {
    catalogTableCount: 2,
    inventoryTableCount: 2,
    tables: [
      {
        table: "organizations",
        classification: "global",
        owningServices: ["organization-service"],
        rowSecurityEnabled: false,
        forceRowSecurityEnabled: false,
      },
      {
        table: "rh.requests",
        classification: "tenant",
        owningServices: ["rh-service"],
        rowSecurityEnabled: false,
        forceRowSecurityEnabled: false,
      },
    ],
  });
});

test("runCli exige URL explícita e consulta somente o catálogo", async () => {
  await assert.rejects(() => runCli({ argv: [] }), /--database-url/);

  const report = await runCli({
    argv: ["--database-url", "postgresql://test.invalid/ephemeral"],
    dependencies: {
      createReadOnlyClient: async () => ({}),
      loadInventory: async () => [
        { table: "rh.requests", classification: "tenant", owningServices: ["rh-service"] },
      ],
      withReadOnlyTransaction: async (_client, callback) =>
        callback({
          query: async (query) => {
            assert.equal(query, CATALOG_QUERY);
            return {
              rows: [
                { table_name: "rh.requests", relrowsecurity: false, relforcerowsecurity: false },
              ],
            };
          },
        }),
    },
  });

  assert.equal(report.tables[0].table, "rh.requests");
});

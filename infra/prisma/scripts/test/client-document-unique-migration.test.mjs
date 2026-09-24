import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../migrations/20260924150000_unique_client_document_per_organization/migration.sql", import.meta.url),
  "utf8",
);

test("a constraint migration blocks unresolved normalized client duplicates", () => {
  assert.match(migration, /deduplicação manual de #1374/);
  assert.match(migration, /HAVING count\(\*\) > 1/);
  assert.match(migration, /RAISE EXCEPTION/);
});

test("the unique index uses organization and normalized non-placeholder documents", () => {
  assert.match(migration, /uq_clients_organization_document_normalized/);
  assert.match(migration, /upper\(regexp_replace\("cpf_cnpj"/);
  assert.match(migration, /"organization_id"/);
  assert.match(migration, /length\(regexp_replace\("cpf_cnpj".*IN \(11, 14\)/s);
});

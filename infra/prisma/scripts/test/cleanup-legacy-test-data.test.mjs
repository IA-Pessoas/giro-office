import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda a limpeza real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../../../scripts/qa/cleanup-legacy-test-data.sql", import.meta.url),
  "utf8",
);
const VERIFY = readFileSync(
  new URL("../../../../scripts/qa/verify-no-test-data.sql", import.meta.url),
  "utf8",
);

const FIXTURE = `
DROP TABLE IF EXISTS "tecnologia.request_messages", "tecnologia.requests", "tecnologia.inventory",
  "tecnologia.terms", clients, stock;
CREATE TABLE stock (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE clients (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE "tecnologia.requests" (
  id text PRIMARY KEY, title text NOT NULL, organization_id text NOT NULL, created_at timestamp NOT NULL
);
CREATE TABLE "tecnologia.request_messages" (
  id text PRIMARY KEY, request_id text NOT NULL REFERENCES "tecnologia.requests"(id) ON DELETE CASCADE
);
CREATE TABLE "tecnologia.inventory" (id text PRIMARY KEY, asset_code text NOT NULL, organization_id text NOT NULL);
CREATE TABLE "tecnologia.terms" (
  id text PRIMARY KEY, asset_code text, equipament_list text, imei text, organization_id text NOT NULL
);
INSERT INTO clients VALUES ('c1', 'Cliente real');
INSERT INTO "tecnologia.requests" VALUES
  ('r1', 'Teste', 'org', '2025-01-01'), ('r2', ' teste 00001 ', 'org', '2025-01-01'),
  ('r3', 'TESTE', 'org', '2025-01-01'), ('r4', 'Teste de impressora', 'org', '2025-01-01');
INSERT INTO "tecnologia.request_messages" VALUES ('m1', 'r1'), ('m4', 'r4');
INSERT INTO "tecnologia.inventory" VALUES ('i1', 'teste', 'org'), ('i2', 'N04CASTELO', 'org');
INSERT INTO "tecnologia.terms" VALUES
  ('t1', NULL, 'testecodigo', NULL, 'org'), ('t2', 'N04CASTELO', 'Notebook', NULL, 'org');
`;

const { psql, query } = usePostgres("legacy-test-data");

const REMAINING = `SELECT (SELECT string_agg(id, ',' ORDER BY id) FROM "tecnologia.requests") || '|'
  || (SELECT string_agg(id, ',' ORDER BY id) FROM "tecnologia.request_messages") || '|'
  || (SELECT string_agg(id, ',' ORDER BY id) FROM "tecnologia.inventory") || '|'
  || (SELECT string_agg(id, ',' ORDER BY id) FROM "tecnologia.terms")`;

test("dry-run lista os alvos e nao apaga nada", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tecnologia\.requests\|r2\| teste 00001 /);
  assert.doesNotMatch(result.stdout, /\|r4\|/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(REMAINING), "r1,r2,r3,r4|m1,m4|i1,i2|t1,t2");
});

test("apply exige o total conferido no dry-run", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL, ["apply=1", "expected=4"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /esperado 4, encontrado 5/);
  assert.equal(query(REMAINING), "r1,r2,r3,r4|m1,m4|i1,i2|t1,t2");
});

test("apply apaga so os nomes exatos de teste e a verificacao zera", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL, ["apply=1", "expected=5"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(query(REMAINING), "r4|m4|i2|t2");
  assert.equal(psql(SQL, ["apply=1", "expected=0"]).status, 0);
  const verify = psql(VERIFY);
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /^0$/m);
});

test("verificacao aponta registro QA_ fora das listas", { skip: !hasDocker }, () => {
  query(FIXTURE);
  query("INSERT INTO stock VALUES ('s1', 'QA_Item_Estoque')");
  const verify = psql(VERIFY);
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /stock\.name\|1/);
  assert.match(verify.stdout, /tecnologia\.requests\.title\|3/);
});

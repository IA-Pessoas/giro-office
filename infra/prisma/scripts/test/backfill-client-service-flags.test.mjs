import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/backfill-client-service-flags.sql", import.meta.url),
  "utf8",
);

const FIXTURE = `
DROP TABLE IF EXISTS "contabil.control", "triagem.configs", "pessoal.ldd", clients;
CREATE TABLE clients (
  id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, status text NOT NULL,
  contabil boolean, fiscal boolean, pessoal boolean
);
CREATE TABLE "contabil.control" (id text PRIMARY KEY, client_id text);
CREATE TABLE "triagem.configs" (id text PRIMARY KEY, client_id text, type text);
CREATE TABLE "pessoal.ldd" (id text PRIMARY KEY, client_id text);
INSERT INTO clients VALUES
  ('c-control', 'org', 'Controle', 'Ativo', NULL, NULL, NULL),
  ('c-triage-contabil', 'org', 'Triagem contabil', 'Ativo', NULL, NULL, NULL),
  ('c-triage-fiscal', 'org', 'Triagem fiscal', 'Ativo', false, false, NULL),
  ('c-pessoal', 'org', 'Pessoal', 'Ativo', NULL, NULL, false),
  ('c-inactive', 'org', 'Inativo', 'Inativo', NULL, NULL, NULL),
  ('c-already', 'org', 'Ja ligado', 'Ativo', true, NULL, NULL),
  ('c-none', 'org', 'Sem evidencia', 'Ativo', NULL, NULL, true);
INSERT INTO "contabil.control" VALUES ('1', 'c-control'), ('2', 'c-already'), ('3', 'c-inactive');
INSERT INTO "triagem.configs" VALUES
  ('1', 'c-triage-fiscal', 'FISCAL'), ('2', 'c-triage-contabil', 'CONTABIL');
INSERT INTO "pessoal.ldd" VALUES ('1', 'c-pessoal');
`;

const { psql, query } = usePostgres("service-flags-test");

const FLAGS = `SELECT string_agg(id || '=' || coalesce(contabil::text, '-') || coalesce(fiscal::text, '-')
  || coalesce(pessoal::text, '-'), ',' ORDER BY id) FROM clients`;
const BEFORE =
  "c-already=true--,c-control=---,c-inactive=---,c-none=--true,c-pessoal=--false," +
  "c-triage-contabil=---,c-triage-fiscal=falsefalse-";

test("dry-run relata as flags propostas e nao altera nada", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /contabil\|Ativo\|t\|2/);
  assert.match(result.stdout, /contabil\|Inativo\|f\|1/);
  assert.match(result.stdout, /fiscal\|Ativo\|t\|1/);
  assert.match(result.stdout, /pessoal\|Ativo\|t\|1/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(FLAGS), BEFORE);
});

test("apply liga so flags de ativos com evidencia e e idempotente", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL, ["apply=1"]);
  assert.equal(result.status, 0, result.stderr);
  const expected =
    "c-already=true--,c-control=true--,c-inactive=---,c-none=--true,c-pessoal=--true," +
    "c-triage-contabil=true--,c-triage-fiscal=falsetrue-";
  assert.equal(query(FLAGS), expected);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(FLAGS), expected);
});

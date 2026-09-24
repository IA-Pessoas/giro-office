import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/backfill-installment-paid-count.sql", import.meta.url),
  "utf8",
);

const FIXTURE = `
DROP TABLE IF EXISTS "parcelamento.installmentsCompetencies", "parcelamento.installments";
CREATE TABLE "parcelamento.installments" (
  id text PRIMARY KEY, organization_id text NOT NULL, client_id text NOT NULL,
  paid_installments_count int NOT NULL, agreed_installments_count int NOT NULL,
  remaining_installments_count int NOT NULL, overdue_installments_count int NOT NULL,
  outstanding_balance float NOT NULL, current_month_installment_amount float NOT NULL,
  status text NOT NULL, completion_date timestamp
);
CREATE TABLE "parcelamento.installmentsCompetencies" (
  id text PRIMARY KEY, organization_id text NOT NULL, installment_id text NOT NULL,
  how_many_paid int NOT NULL, how_many_overdue int NOT NULL, competence text NOT NULL
);
INSERT INTO "parcelamento.installments" VALUES
  ('sum', 'org', 'c1', 0, 60, 60, 0, 6000, 100, 'Ativo', NULL),
  ('already', 'org', 'c2', 5, 60, 55, 0, 5500, 100, 'Ativo', NULL),
  ('none', 'org', 'c3', 0, 60, 60, 0, 6000, 100, 'Ativo', NULL),
  ('settles', 'org', 'c4', 0, 2, 2, 0, 200, 100, 'Ativo', NULL);
INSERT INTO "parcelamento.installmentsCompetencies" VALUES
  ('1', 'org', 'sum', 1, 2, '2024-01'), ('2', 'org', 'sum', 1, 0, '2024-02'),
  ('3', 'org', 'sum', 2, 1, '2024-03'),
  ('x', 'other-org', 'sum', 50, 0, '2024-04'),
  ('4', 'org', 'already', 3, 0, '2024-01'),
  ('5', 'org', 'none', 0, 0, '2024-01'),
  ('6', 'org', 'settles', 2, 0, '2024-01'), ('7', 'org', 'settles', 2, 0, '2024-02');
`;

const { psql, query } = usePostgres("installment-paid-test");

// id=pagas/restantes/vencidas/saldo/status/liquidado?
const STATE = `SELECT string_agg(id || '=' || paid_installments_count || '/' || remaining_installments_count
  || '/' || overdue_installments_count || '/' || outstanding_balance || '/' || status || '/'
  || (completion_date IS NOT NULL), ',' ORDER BY id) FROM "parcelamento.installments"`;
const BEFORE =
  "already=5/55/0/5500/Ativo/false,none=0/60/0/6000/Ativo/false," +
  "settles=0/2/0/200/Ativo/false,sum=0/60/0/6000/Ativo/false";

test("dry-run relata o recalculo sem gravar", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sum\|c1\|4\|60\|56\|0\|5600\|f/);
  assert.match(result.stdout, /settles\|c4\|4\|2\|0\|0\|0\|t/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(STATE), BEFORE);
});

test("apply repete recalculateAggregates, ignora outra organizacao e e idempotente", {
  skip: !hasDocker,
}, () => {
  query(FIXTURE);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  const expected =
    "already=5/55/0/5500/Ativo/false,none=0/60/0/6000/Ativo/false," +
    "settles=4/0/0/0/Liquidado/true,sum=4/56/0/5600/Ativo/false";
  assert.equal(query(STATE), expected);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(STATE), expected);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/dedupe-clients-by-document.sql", import.meta.url),
  "utf8",
);

const FIXTURE = `
DROP TABLE IF EXISTS pa, tasks, "pessoal.payroll", clients;
CREATE TABLE clients (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  cpf_cnpj text NOT NULL DEFAULT '',
  name text NOT NULL,
  email text,
  city text,
  register_date_prospecting timestamp NOT NULL,
  deletion_date timestamp,
  contabil boolean,
  status text NOT NULL DEFAULT 'Ativo'
);
CREATE TABLE tasks (id text PRIMARY KEY, client_id text REFERENCES clients(id));
CREATE TABLE pa (id text PRIMARY KEY, client_id text UNIQUE REFERENCES clients(id));
INSERT INTO clients (id, organization_id, cpf_cnpj, name, email, city, register_date_prospecting)
VALUES
  ('keep', 'org-1', '19.526.662/0001-28', 'Antigo', NULL, '', '2024-01-01'),
  ('other-org', 'org-2', '19526662000128', 'Outra org', NULL, NULL, '2023-01-01'),
  ('zeros-a', 'org-1', '00.000.000/0000-00', 'Zeros A', NULL, NULL, '2024-01-01'),
  ('zeros-b', 'org-1', '00000000000000', 'Zeros B', NULL, NULL, '2024-01-01'),
  ('masked-a', 'org-1', '***.123.456-**', 'Mascara A', NULL, NULL, '2024-01-01'),
  ('masked-b', 'org-1', '***.123.456-**', 'Mascara B', NULL, NULL, '2024-01-01');
-- Estado do duplicado (exclusao, flag de servico) nao pode passar para o mantido.
INSERT INTO clients VALUES
  ('dup', 'org-1', '19526662000128', 'Novo', 'novo@x.com', 'Recife', '2025-01-01', '2025-06-01', true);
INSERT INTO tasks VALUES ('t1', 'dup'), ('t2', 'keep');
-- Vinculo sem FK, remapeado pela lista explicita do reparo.
CREATE TABLE "pessoal.payroll" (id text PRIMARY KEY, client_id text);
INSERT INTO "pessoal.payroll" VALUES ('p1', 'dup');
`;

const { psql, query } = usePostgres("dedupe-clients-test");

test("dry-run relata o duplicado e nao altera nada", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /19526662000128\|keep\|dup/);
  assert.match(result.stdout, /tasks\|client_id\|1\|/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query("SELECT count(*) FROM clients"), "7");
  assert.equal(query("SELECT client_id FROM tasks WHERE id = 't1'"), "dup");
});

test("apply mantem o mais antigo, move vinculos e preenche campos vazios", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL, ["apply=1"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(query("SELECT string_agg(id, ',' ORDER BY id) FROM clients"),
    "keep,masked-a,masked-b,other-org,zeros-a,zeros-b");
  assert.equal(query("SELECT string_agg(client_id, ',' ORDER BY id) FROM tasks"), "keep,keep");
  assert.equal(query(`SELECT client_id FROM "pessoal.payroll"`), "keep");
  assert.equal(query("SELECT name || '|' || email || '|' || city FROM clients WHERE id = 'keep'"),
    "Antigo|novo@x.com|Recife");
  assert.equal(query("SELECT deletion_date IS NULL AND contabil IS NULL FROM clients WHERE id = 'keep'"), "t");
  // Idempotente: segunda execucao nao encontra nada.
  const again = psql(SQL, ["apply=1"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(query("SELECT count(*) FROM clients"), "6");
});

test("conflito de unicidade em vinculo aborta o apply sem alterar nada", { skip: !hasDocker }, () => {
  query(FIXTURE);
  query("INSERT INTO pa VALUES ('pa-keep', 'keep'), ('pa-dup', 'dup')");
  const dryRun = psql(SQL);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stderr, /WARNING:.*o apply vai falhar/);
  const result = psql(SQL, ["apply=1"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pa\.client_id/);
  assert.equal(query("SELECT count(*) FROM clients"), "7");
  assert.equal(query("SELECT client_id FROM tasks WHERE id = 't1'"), "dup");
});

test("apply mantem o ativo, ignora clientes de teste e agrupa CNPJ alfanumerico", {
  skip: !hasDocker,
}, () => {
  query(FIXTURE);
  query(`INSERT INTO clients (id, organization_id, cpf_cnpj, name, register_date_prospecting, status)
    VALUES
      ('old-inactive', 'org-1', '11.222.333/0001-81', 'Antigo inativo', '2020-01-01', 'Inativo'),
      ('new-active', 'org-1', '11222333000181', 'Novo ativo', '2025-01-01', 'Ativo'),
      ('qa-a', 'org-1', '529.982.247-25', 'QA_Cliente_Dup', '2024-01-01', 'Ativo'),
      ('qa-b', 'org-1', '52998224725', 'QA_Cliente_PJ', '2024-02-01', 'Ativo'),
      ('alnum-a', 'org-1', '12.ABC.345/01DE-35', 'Alfa', '2024-01-01', 'Ativo'),
      ('alnum-b', 'org-1', '12abc34501de35', 'Alfa copia', '2024-03-01', 'Ativo')`);
  const result = psql(SQL, ["apply=1"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    query(`SELECT string_agg(id, ',' ORDER BY id) FROM clients
      WHERE id IN ('old-inactive', 'new-active', 'qa-a', 'qa-b', 'alnum-a', 'alnum-b')`),
    "alnum-a,new-active,qa-a,qa-b",
  );
});

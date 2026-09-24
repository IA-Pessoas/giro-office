import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/dedupe-clients-by-document.sql", import.meta.url),
  "utf8",
);
const CONTAINER = `dedupe-clients-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const FIXTURE = `
DROP TABLE IF EXISTS pa, tasks, "pessoal.payroll", clients;
CREATE TABLE clients (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  cpf_cnpj text NOT NULL DEFAULT '',
  name text NOT NULL,
  email text,
  city text,
  register_date_prospecting timestamp NOT NULL
);
CREATE TABLE tasks (id text PRIMARY KEY, client_id text REFERENCES clients(id));
CREATE TABLE pa (id text PRIMARY KEY, client_id text UNIQUE REFERENCES clients(id));
INSERT INTO clients VALUES
  ('keep', 'org-1', '19.526.662/0001-28', 'Antigo', NULL, '', '2024-01-01'),
  ('dup', 'org-1', '19526662000128', 'Novo', 'novo@x.com', 'Recife', '2025-01-01'),
  ('other-org', 'org-2', '19526662000128', 'Outra org', NULL, NULL, '2023-01-01'),
  ('zeros-a', 'org-1', '00.000.000/0000-00', 'Zeros A', NULL, NULL, '2024-01-01'),
  ('zeros-b', 'org-1', '00000000000000', 'Zeros B', NULL, NULL, '2024-01-01'),
  ('masked-a', 'org-1', '***.123.456-**', 'Mascara A', NULL, NULL, '2024-01-01'),
  ('masked-b', 'org-1', '***.123.456-**', 'Mascara B', NULL, NULL, '2024-01-01');
INSERT INTO tasks VALUES ('t1', 'dup'), ('t2', 'keep');
-- Vinculo sem FK, remapeado pela lista explicita do reparo.
CREATE TABLE "pessoal.payroll" (id text PRIMARY KEY, client_id text);
INSERT INTO "pessoal.payroll" VALUES ('p1', 'dup');
`;

function psql(sql, vars = []) {
  const args = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-t", "-A"];
  for (const v of vars) args.push("-v", v);
  return spawnSync("docker", [...args, "-f", "-"], { input: sql, encoding: "utf8" });
}

function query(sql) {
  const result = psql(sql);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

before(() => {
  if (!hasDocker) return;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", CONTAINER, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
  ]);
  for (let i = 0; i < 60; i++) {
    if (psql("SELECT 1").status === 0) return;
    execFileSync("sleep", ["1"]);
  }
  throw new Error("Postgres de teste nao subiu");
});

after(() => {
  if (hasDocker) spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
});

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
  // Idempotente: segunda execucao nao encontra nada.
  const again = psql(SQL, ["apply=1"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(query("SELECT count(*) FROM clients"), "6");
});

test("conflito de unicidade em vinculo aborta o apply sem alterar nada", { skip: !hasDocker }, () => {
  query(FIXTURE);
  query("INSERT INTO pa VALUES ('pa-keep', 'keep'), ('pa-dup', 'dup')");
  const result = psql(SQL, ["apply=1"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pa\.client_id/);
  assert.equal(query("SELECT count(*) FROM clients"), "7");
  assert.equal(query("SELECT client_id FROM tasks WHERE id = 't1'"), "dup");
});

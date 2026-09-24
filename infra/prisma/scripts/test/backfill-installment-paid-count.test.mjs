import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/backfill-installment-paid-count.sql", import.meta.url),
  "utf8",
);
const CONTAINER = `installment-paid-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const FIXTURE = `
DROP TABLE IF EXISTS "parcelamento.installmentsCompetencies", "parcelamento.installments";
CREATE TABLE "parcelamento.installments" (
  id text PRIMARY KEY, organization_id text NOT NULL, client_id text NOT NULL,
  paid_installments_count int NOT NULL, agreed_installments_count int NOT NULL
);
CREATE TABLE "parcelamento.installmentsCompetencies" (
  id text PRIMARY KEY, installment_id text NOT NULL, how_many_paid int NOT NULL, competence text NOT NULL
);
INSERT INTO "parcelamento.installments" VALUES
  ('sum', 'org', 'c1', 0, 60),
  ('already', 'org', 'c2', 5, 60),
  ('none', 'org', 'c3', 0, 60),
  ('exceeds', 'org', 'c4', 0, 2);
INSERT INTO "parcelamento.installmentsCompetencies" VALUES
  ('1', 'sum', 1, '2024-01'), ('2', 'sum', 1, '2024-02'), ('3', 'sum', 2, '2024-03'),
  ('4', 'already', 3, '2024-01'),
  ('5', 'none', 0, '2024-01'),
  ('6', 'exceeds', 2, '2024-01'), ('7', 'exceeds', 2, '2024-02');
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

const PAID = `SELECT string_agg(id || '=' || paid_installments_count, ',' ORDER BY id)
  FROM "parcelamento.installments"`;

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

test("dry-run relata a soma e o que excede as acordadas, sem gravar", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sum\|c1\|4\|60\|t/);
  assert.match(result.stdout, /exceeds\|c4\|4\|2\|f/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(PAID), "already=5,exceeds=0,none=0,sum=0");
});

test("apply grava a soma so onde esta zerado e cabe nas acordadas", { skip: !hasDocker }, () => {
  query(FIXTURE);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(PAID), "already=5,exceeds=0,none=0,sum=4");
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(PAID), "already=5,exceeds=0,none=0,sum=4");
});

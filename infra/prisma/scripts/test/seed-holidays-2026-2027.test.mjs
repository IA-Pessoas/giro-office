import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda a carga real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(new URL("../../repairs/seed-holidays-2026-2027.sql", import.meta.url), "utf8");
const CONTAINER = `holidays-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const FIXTURE = `
DROP TABLE IF EXISTS "rh.holidays", organizations;
CREATE TABLE organizations (id text PRIMARY KEY);
CREATE TABLE "rh.holidays" (
  id text PRIMARY KEY, name text NOT NULL, date timestamp NOT NULL, organization_id text NOT NULL
);
INSERT INTO organizations VALUES ('org-a'), ('org-b');
-- org-a ja tem feriado municipal no dia de Tiradentes: nao duplica o dia.
INSERT INTO "rh.holidays" VALUES ('h1', 'Aniversario da cidade', '2026-04-21 00:00:00', 'org-a');
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

test("dry-run relata a carga sem gravar", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /org-a\|25/);
  assert.match(result.stdout, /org-b\|26/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays"`), "1");
});

test("apply cadastra 26 datas por organizacao, sem duplicar o dia, e e idempotente", {
  skip: !hasDocker,
}, () => {
  query(FIXTURE);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays" WHERE organization_id = 'org-b'`), "26");
  assert.equal(query(`SELECT count(*) FROM "rh.holidays" WHERE organization_id = 'org-a'`), "26");
  assert.equal(
    query(`SELECT name FROM "rh.holidays" WHERE organization_id = 'org-a' AND date = '2026-04-21'`),
    "Aniversario da cidade",
  );
  assert.equal(
    query(`SELECT string_agg(to_char(date, 'YYYY-MM-DD'), ',' ORDER BY date) FROM "rh.holidays"
      WHERE organization_id = 'org-b' AND name IN ('Carnaval', 'Sexta-feira Santa', 'Corpus Christi')`),
    "2026-02-16,2026-02-17,2026-04-03,2026-06-04,2027-02-08,2027-02-09,2027-03-26,2027-05-27",
  );
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays"`), "52");
});

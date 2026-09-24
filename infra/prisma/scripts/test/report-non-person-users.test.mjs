import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda o relatorio real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(new URL("../../repairs/report-non-person-users.sql", import.meta.url), "utf8");
const CONTAINER = `non-person-users-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const FIXTURE = `
CREATE TABLE departments (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE users (
  id text PRIMARY KEY, name text NOT NULL, login text NOT NULL, permission int NOT NULL,
  status text NOT NULL, organization_id text, permission_id text, department_id text NOT NULL
    REFERENCES departments(id),
  cpf text, job_title text
);
CREATE TABLE permissions (
  id text PRIMARY KEY, user_id text, rh int NOT NULL, ti int NOT NULL, contabil int NOT NULL
);
CREATE TABLE tasks (id text PRIMARY KEY, responsible_id text REFERENCES users(id));
INSERT INTO departments VALUES ('d1', 'Diretoria'), ('d2', 'TI');
INSERT INTO users VALUES
  ('u1', 'Maria Souza', 'maria', 1, 'active', 'org', 'p1', 'd1', '52998224725', 'Diretora'),
  ('u2', 'ESTOQUE', 'estoque', 1, 'active', 'org', NULL, 'd2', NULL, NULL),
  ('u3', 'Alterdata Informatica', 'alterdata', 1, 'active', 'org', NULL, 'd2', '', NULL),
  ('u4', 'GECETI', 'geceti', 1, 'inactive', 'org', NULL, 'd2', NULL, NULL),
  ('u5', 'Joao', 'joao', 1, 'active', 'org', NULL, 'd2', '11144477735', NULL);
INSERT INTO permissions VALUES ('p1', 'u1', 0, 2, 0);
INSERT INTO tasks VALUES ('t1', 'u2'), ('t2', 'u2'), ('t3', 'u1');
`;

function psql(sql) {
  return spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8" },
  );
}

before(() => {
  if (!hasDocker) return;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", CONTAINER, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
  ]);
  for (let i = 0; i < 60; i++) {
    if (psql("SELECT 1").status === 0) {
      const fixture = psql(FIXTURE);
      assert.equal(fixture.status, 0, fixture.stderr);
      return;
    }
    execFileSync("sleep", ["1"]);
  }
  throw new Error("Postgres de teste nao subiu");
});

after(() => {
  if (hasDocker) spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
});

test("lista entidades candidatas com vinculos e ativos com permissoes, sem gravar", {
  skip: !hasDocker,
}, () => {
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /u2\|ESTOQUE\|estoque\|active\|citado na issue\|tasks\.responsible_id=2/);
  assert.match(result.stdout, /u3\|Alterdata Informatica\|alterdata\|active\|citado na issue/);
  assert.match(result.stdout, /u4\|GECETI\|geceti\|inactive/);
  assert.match(result.stdout, /Maria Souza\|maria\|Diretoria\|Diretora\|1\|ti=2/);
  assert.doesNotMatch(result.stdout, /u5\|Joao\|joao\|active\|/);
  assert.doesNotMatch(result.stdout, /u1\|Maria Souza\|maria\|active\|/);
  const count = psql("SELECT count(*) FROM users WHERE status = 'active'");
  assert.equal(count.stdout.trim(), "4");
});

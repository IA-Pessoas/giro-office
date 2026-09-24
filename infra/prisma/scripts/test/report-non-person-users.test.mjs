import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda o relatorio real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(new URL("../../repairs/report-non-person-users.sql", import.meta.url), "utf8");

const FIXTURE = `
CREATE TABLE departments (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE users (
  id text PRIMARY KEY, name text NOT NULL, login text NOT NULL, permission int NOT NULL,
  status text NOT NULL, organization_id text, permission_id text, department_id text NOT NULL
    REFERENCES departments(id),
  cpf text, job_title text, type text
);
CREATE TABLE permissions (
  id text PRIMARY KEY, user_id text, rh int NOT NULL, ti int NOT NULL, contabil int NOT NULL
);
CREATE TABLE tasks (id text PRIMARY KEY, responsible_id text REFERENCES users(id));
INSERT INTO departments VALUES ('d1', 'Diretoria'), ('d2', 'TI');
INSERT INTO users VALUES
  ('u1', 'Maria Souza', 'maria', 2, 'active', 'org', 'p1', 'd1', '52998224725', 'Diretora', 'user'),
  ('u2', 'ESTOQUE', 'estoque', 2, 'active', 'org', NULL, 'd2', NULL, NULL, 'user'),
  ('u3', 'Alterdata Informática', 'alterdata', 2, 'active', 'org', NULL, 'd2', '', NULL, 'user'),
  ('u4', 'GECETI', 'geceti', 2, 'inactive', 'org', NULL, 'd2', NULL, NULL, 'user'),
  ('u5', 'Joao', 'joao', 2, 'active', 'org', NULL, 'd2', '11144477735', NULL, 'user'),
  ('u6', 'Serviços Gerais', 'servicos', 2, 'active', NULL, NULL, 'd2', NULL, NULL, 'user');
INSERT INTO permissions VALUES ('p1', 'u1', 0, 2, 0);
INSERT INTO tasks VALUES ('t1', 'u2'), ('t2', 'u2'), ('t3', 'u1');
`;

const { psql, query } = usePostgres("non-person-users-test", { setup: FIXTURE });

test("lista entidades candidatas com vinculos e ativos com permissoes, sem gravar", {
  skip: !hasDocker,
}, () => {
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /org\|u2\|ESTOQUE\|estoque\|active\|citado na issue\|tasks\.responsible_id=2/);
  assert.match(result.stdout, /org\|u3\|Alterdata Informática\|alterdata\|active\|citado na issue/);
  assert.match(result.stdout, /org\|u4\|GECETI\|geceti\|inactive/);
  assert.match(result.stdout, /\(sem organizacao\)\|u6\|Serviços Gerais\|servicos\|active\|nome de empresa sem CPF/);
  assert.match(result.stdout, /org\|Maria Souza\|maria\|Diretoria\|Diretora\|user\|2\|ti=2/);
  assert.doesNotMatch(result.stdout, /u5\|Joao\|joao\|active\|/);
  assert.doesNotMatch(result.stdout, /u1\|Maria Souza\|maria\|active\|/);
  const count = psql("SELECT count(*) FROM users WHERE status = 'active'");
  assert.equal(count.stdout.trim(), "5");
});

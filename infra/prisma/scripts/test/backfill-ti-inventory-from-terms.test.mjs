import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda o reparo real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/backfill-ti-inventory-from-terms.sql", import.meta.url),
  "utf8",
);
const CONTAINER = `ti-inventory-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

const FIXTURE = `
DROP TABLE IF EXISTS "tecnologia.inventory", "tecnologia.inventoryCategories", "tecnologia.terms", users;
CREATE TABLE users (id text PRIMARY KEY, organization_id text NOT NULL, status text NOT NULL);
INSERT INTO users VALUES
  ('u-old', 'org', 'active'), ('u-new', 'org', 'active'), ('u3', 'org', 'inactive'),
  ('u4', 'org', 'active'), ('u5', 'org', 'active');
CREATE TABLE "tecnologia.inventoryCategories" (
  id text PRIMARY KEY, name text NOT NULL, tag text, active boolean NOT NULL DEFAULT true,
  organization_id text NOT NULL
);
CREATE TABLE "tecnologia.inventory" (
  id text PRIMARY KEY, user_id text, location_id text, category_id text NOT NULL,
  asset_code text NOT NULL, notes text, delivery_date timestamp, return_date timestamp,
  responsible_it_staff_id text, created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL, organization_id text NOT NULL,
  UNIQUE (organization_id, asset_code)
);
CREATE TABLE "tecnologia.terms" (
  id text PRIMARY KEY, user_id text, date timestamp NOT NULL, signed_at timestamp, reason text,
  user_name text NOT NULL, equipament_list text, brand text, asset_code text,
  organization_id text NOT NULL
);
INSERT INTO "tecnologia.inventoryCategories" VALUES ('cat', 'Notebook', NULL, true, 'org');
INSERT INTO "tecnologia.inventory" (id, category_id, asset_code, updated_at, organization_id)
VALUES ('i1', 'cat', 'MS18CASTELO', now(), 'org');
-- t1 assinado vence t2 pendente mais novo; u3 inativo nao recebe atribuicao.
INSERT INTO "tecnologia.terms" VALUES
  ('t1', 'u-old', '2024-01-01', '2024-01-02', 'Entrega', 'Ana', 'Notebook', 'Dell', 'N04castelo', 'org'),
  ('t2', 'u-new', '2025-01-01', NULL, NULL, 'Bia', 'Notebook', 'Dell', ' n04castelo ', 'org'),
  ('t3', 'u3', '2024-05-01', '2024-05-02', NULL, 'Caio', 'Monitor', 'LG', 'MS27CASTELO; N30CASTELO', 'org'),
  ('t4', 'u4', '2024-05-01', '2024-05-02', NULL, 'Davi', 'Notebook', 'HP', 'ms18castelo', 'org'),
  ('t5', 'u5', '2024-05-01', NULL, NULL, 'Eva', 'Kit', NULL, NULL, 'org');
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

const INVENTORY = `SELECT string_agg(i.asset_code || ':' || coalesce(i.user_id, '-') || ':'
  || coalesce(to_char(i.delivery_date, 'YYYY-MM-DD'), '-') || ':' || c.name, ',' ORDER BY i.asset_code)
  FROM "tecnologia.inventory" i JOIN "tecnologia.inventoryCategories" c ON c.id = i.category_id`;

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

test("dry-run relata os ativos a criar sem gravar", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /N04castelo\|u-old\|2024-01-01\|t/);
  assert.match(result.stdout, /MS27CASTELO\|-\|2024-05-01/);
  assert.doesNotMatch(result.stdout, /ms18castelo\|u4/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(INVENTORY), "MS18CASTELO:-:-:Notebook");
});

test("apply cria um item por codigo citado, pelo termo assinado mais recente, e e idempotente", {
  skip: !hasDocker,
}, () => {
  query(FIXTURE);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  const expected =
    "MS18CASTELO:-:-:Notebook,MS27CASTELO:-:-:Migrado dos termos," +
    "N04castelo:u-old:2024-01-01:Migrado dos termos,N30CASTELO:-:-:Migrado dos termos";
  assert.equal(query(INVENTORY), expected);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(INVENTORY), expected);
  assert.equal(
    query(`SELECT count(*) FROM "tecnologia.inventoryCategories" WHERE name = 'Migrado dos termos'`),
    "1",
  );
});

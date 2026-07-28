import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../infra/prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(
  new URL(
    "../infra/prisma/migrations/20260727160000_normalize_permission_levels/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = await readFile(new URL("../infra/prisma/seed.ts", import.meta.url), "utf8");

const ACTIVE_MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

function migratePermissionValue(value) {
  return value === null ? 0 : value + 1;
}

function applyMigration(values, migrationAlreadyApplied) {
  return migrationAlreadyApplied ? values : values.map(migratePermissionValue);
}

function countPermissionValues(values) {
  return values.reduce((counts, value) => {
    const key = String(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

test("schema usa níveis modulares obrigatórios 0..3 e remove os módulos aposentados", () => {
  const permissionModel = schema.match(/model Permission \{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const moduleKey of ACTIVE_MODULE_KEYS) {
    assert.match(permissionModel, new RegExp(`\\s${moduleKey}\\s+Int\\s+@default\\(0\\)`));
  }

  for (const retiredKey of ["atendimento", "pec", "wiki"]) {
    assert.doesNotMatch(permissionModel, new RegExp(`\\s${retiredKey}\\s`));
  }
});

test("migration desloca uma vez, impõe default/check e remove as colunas aposentadas", () => {
  assert.match(migration, /IS NULL THEN 0|COALESCE/i);
  assert.match(migration, /\+\s*1/);
  assert.match(migration, /CHECK/i);
  assert.match(migration, /DROP COLUMN IF EXISTS/i);
  assert.match(migration, /ON CONFLICT(?:\s*\([^)]*\))?\s+DO NOTHING/i);
  assert.match(seed, /certificado:\s*3/);
  assert.doesNotMatch(seed, /\batendimento\s*:/);
  assert.doesNotMatch(seed, /\bpec\s*:/);
  assert.doesNotMatch(seed, /\bwiki\s*:/);
});

test("harness de contagens comprova a transformação e a proteção contra reaplicação", () => {
  const before = [null, null, 0, 1, 1, 2, 2, 2];
  const after = before.map(migratePermissionValue);

  assert.deepEqual(countPermissionValues(before), { 0: 1, 1: 2, 2: 3, null: 2 });
  assert.deepEqual(countPermissionValues(after), { 0: 2, 1: 1, 2: 2, 3: 3 });
  assert.deepEqual(applyMigration(after, true), after);
  assert.match(migration, /migration_applied/);
  assert.match(migration, /IF NOT migration_applied/);
});

test("migration declara a mesma constraint 0..3 para cada módulo ativo", () => {
  for (const moduleKey of ACTIVE_MODULE_KEYS) {
    assert.match(migration, new RegExp(`'${moduleKey}'`));
  }
  assert.match(migration, /CHECK \(%I BETWEEN 0 AND 3\)/);
});

test("migration real transforma os níveis e permanece idempotente em PostgreSQL", {
  skip:
    !process.env.PERMISSION_MIGRATION_DATABASE_URL &&
    process.env.PERMISSION_MIGRATION_REQUIRED !== "1",
}, () => {
  assert.ok(
    process.env.PERMISSION_MIGRATION_DATABASE_URL,
    "PERMISSION_MIGRATION_DATABASE_URL é obrigatória no modo de rollout",
  );
  const schemaName = `permission_regression_${randomUUID().replaceAll("-", "")}`;
  const moduleColumns = ACTIVE_MODULE_KEYS.map((moduleKey) => `"${moduleKey}" INTEGER`).join(",\n");
  const moduleNames = ACTIVE_MODULE_KEYS.map((moduleKey) => `"${moduleKey}"`).join(", ");
  const rowValues = (value) =>
    ACTIVE_MODULE_KEYS.map(() => (value === null ? "NULL" : value)).join(", ");
  const moduleValues = rowValues(null);
  const moduleUnion = ACTIVE_MODULE_KEYS.map(
    (moduleKey) => `SELECT "${moduleKey}" AS level FROM "permissions"`,
  ).join(" UNION ALL ");
  const sql = `
BEGIN;
CREATE SCHEMA "${schemaName}";
SET LOCAL search_path TO "${schemaName}", public;
CREATE TABLE "permissions" (
    "id" TEXT PRIMARY KEY,
    ${moduleColumns},
    "atendimento" INTEGER,
    "pec" INTEGER,
    "wiki" INTEGER
);
CREATE TABLE "users" ("id" TEXT PRIMARY KEY);
    INSERT INTO "permissions" ("id", ${moduleNames}, "atendimento", "pec", "wiki") VALUES
    ('permission-1', ${moduleValues}, 3, 2, 1),
    ('permission-2', ${rowValues(0)}, NULL, NULL, NULL),
    ('permission-3', ${rowValues(1)}, NULL, NULL, NULL),
    ('permission-4', ${rowValues(2)}, NULL, NULL, NULL);
${migration}
${migration}
SELECT json_build_object(
    'level_0', (SELECT count(*) FROM (${moduleUnion}) AS levels WHERE level = 0),
    'level_1', (SELECT count(*) FROM (${moduleUnion}) AS levels WHERE level = 1),
    'level_2', (SELECT count(*) FROM (${moduleUnion}) AS levels WHERE level = 2),
    'level_3', (SELECT count(*) FROM (${moduleUnion}) AS levels WHERE level = 3),
    'invalid', (SELECT count(*) FROM (${moduleUnion}) AS levels WHERE level IS NULL OR level NOT BETWEEN 0 AND 3),
    'retired_columns', (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'permissions' AND column_name IN ('atendimento', 'pec', 'wiki')),
    'session_version_default', (SELECT column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'session_version'),
    'session_version_nullable', (SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'session_version'),
    'marker_rows', (SELECT count(*) FROM "_giro_permission_migrations")
)::text;
ROLLBACK;
`;
  const result = spawnSync(
    "psql",
    [
      "--no-psqlrc",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      process.env.PERMISSION_MIGRATION_DATABASE_URL,
    ],
    { input: sql, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    level_0: 13,
    level_1: 13,
    level_2: 13,
    level_3: 13,
    invalid: 0,
    retired_columns: 0,
    session_version_default: "0",
    session_version_nullable: "NO",
    marker_rows: 1,
  });
});

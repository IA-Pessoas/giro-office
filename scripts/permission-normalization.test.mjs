import assert from "node:assert/strict";
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

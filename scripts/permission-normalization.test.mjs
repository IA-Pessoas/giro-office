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

test("schema usa níveis modulares obrigatórios 0..3 e remove os módulos aposentados", () => {
  const permissionModel = schema.match(/model Permission \{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const moduleKey of [
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
  ]) {
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

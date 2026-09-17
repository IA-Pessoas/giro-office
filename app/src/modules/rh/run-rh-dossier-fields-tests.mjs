import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RH_DOSSIER_GENDER_OPTIONS,
  RH_DOSSIER_STATUS_OPTIONS,
  getRhDossierGenderLabel,
  getRhDossierGenderValue,
  getRhDossierStatusLabel,
  getRhDossierStatusValue,
} from "./utils/rhDossierUi.ts";

const componentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "components/RhDossierSection.tsx",
);
const componentSource = readFileSync(componentPath, "utf8");
let passed = 0;

function test(name, callback) {
  try {
    callback();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("mantém o catálogo persistido de gênero e status", () => {
  assert.deepEqual(RH_DOSSIER_GENDER_OPTIONS, [
    { value: "F", label: "Feminino" },
    { value: "M", label: "Masculino" },
  ]);
  assert.deepEqual(RH_DOSSIER_STATUS_OPTIONS, [
    { value: "active", label: "Ativo" },
    { value: "inactive", label: "Inativo" },
  ]);
});

test("traduz os valores conhecidos sem alterar as chaves", () => {
  assert.equal(getRhDossierGenderLabel("F"), "Feminino");
  assert.equal(getRhDossierGenderLabel("M"), "Masculino");
  assert.equal(getRhDossierStatusLabel("active"), "Ativo");
  assert.equal(getRhDossierStatusLabel("inactive"), "Inativo");
  assert.equal(getRhDossierGenderValue("Feminino"), "F");
  assert.equal(getRhDossierGenderValue("Masculino"), "M");
  assert.equal(getRhDossierStatusValue("Ativo"), "active");
  assert.equal(getRhDossierStatusValue("Inativo"), "inactive");
  assert.equal(getRhDossierGenderLabel(null), "Não informado");
  assert.equal(getRhDossierStatusLabel(undefined), "Não informado");
});

test("usa dropdowns controlados para gênero e status", () => {
  assert.match(componentSource, /field === "gender"[\s\S]*?<select/);
  assert.match(componentSource, /field === "status"[\s\S]*?<select/);
});

test("traduz status e gênero em todas as visualizações do dossiê", () => {
  assert.match(componentSource, /getRhDossierStatusLabel\(item\.status\)/);
  assert.match(componentSource, /getRhDossierStatusLabel\(dossier\.status\)/);
  assert.match(componentSource, /getRhDossierGenderLabel\(dossier\.gender\)/);
  assert.match(componentSource, /getRhDossierStatusValue\(dossier\.status\)/);
  assert.doesNotMatch(componentSource, /<span[^>]*>\s*\{item\.status\}\s*<\/span>/s);
});

console.log(`RH dossier fields: ${passed} passed`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatTriageCompetence,
  validateTriageCatalogForm,
} from "./components/triagem.helpers.ts";

function runTest(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

runTest("título da competência só com a primeira letra maiúscula (#1326)", () => {
  assert.equal(formatTriageCompetence("2026-09"), "Setembro de 2026");
  assert.equal(formatTriageCompetence("inválida"), "inválida");
});

runTest("catálogo valida em português sem depender do navegador (#1326)", () => {
  const valid = { code: "EMAIL", label: "E-mail", url: "" };
  assert.equal(validateTriageCatalogForm(valid), null);
  assert.equal(validateTriageCatalogForm({ ...valid, code: " " }), "Informe o código do item.");
  assert.equal(validateTriageCatalogForm({ ...valid, label: "" }), "Informe o rótulo do item.");
  assert.equal(
    validateTriageCatalogForm({ ...valid, url: "http://exemplo.com" }),
    "A URL deve começar com https://.",
  );
  assert.equal(validateTriageCatalogForm({ ...valid, url: "https://exemplo.com" }), null);
});

runTest("catálogos saem da tela operacional da Triagem (#1326)", () => {
  const page = readSource("../../pages/triagem.tsx");
  assert.doesNotMatch(page, /<TriageCatalogSection/);
  assert.match(readSource("../../pages/triagem/catalogos.tsx"), /<TriageCatalogSection/);
});

runTest("textos da Triagem sem jargão técnico (#1326)", () => {
  for (const path of [
    "./components/TriageOverviewPanel.tsx",
    "./components/TriageCompetenceSection.tsx",
    "./components/TriageCatalogSection.tsx",
    "./components/TriageExternalLinksSection.tsx",
    "./components/TriageUrgentRequestsSection.tsx",
    "../contabil/components/TriageDocumentsSection.tsx",
  ]) {
    assert.doesNotMatch(readSource(path), /canônic|snapshot|legados/i, path);
  }
});

runTest("responsável da solicitação urgente começa vazio e é obrigatório (#1326)", () => {
  const source = readSource("./components/TriageUrgentRequestsSection.tsx");
  assert.match(source, /<option value="" disabled>\s*Selecione o responsável/);
  assert.match(source, /Selecione o responsável da solicitação\./);
});

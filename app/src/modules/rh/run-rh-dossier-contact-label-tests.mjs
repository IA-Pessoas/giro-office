import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./components/RhDossierSection.tsx", import.meta.url),
  "utf8",
);
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

const contactFields = [
  { id: "rh-contact-name", label: "Nome" },
  { id: "rh-contact-phone", label: "Telefone" },
  { id: "rh-contact-reference", label: "Referência" },
];

test("exibe um label visível para cada campo de contato", () => {
  for (const field of contactFields) {
    assert.match(source, new RegExp(`<label[^>]*htmlFor=\\"${field.id}\\"`));
    assert.match(source, new RegExp(`>\\s*<span[^>]*>\\s*${field.label}\\s*</span>`));
  }
});

test("associa cada label ao input correspondente", () => {
  for (const field of contactFields) {
    assert.match(source, new RegExp(`<input[^>]*id=\\"${field.id}\\"`));
  }
});

test("mantém o formulário de contatos controlado e editável", () => {
  assert.match(source, /value=\{draft\.name\}/);
  assert.match(source, /value=\{draft\.phone\}/);
  assert.match(source, /value=\{draft\.reference\}/);
  assert.match(source, /onChange=\{\(event\) => onChange\(\{ \.\.\.draft, name: event\.target\.value \}\)\}/);
  assert.match(source, /onChange=\{\(event\) => onChange\(\{ \.\.\.draft, phone: event\.target\.value \}\)\}/);
  assert.match(source, /onChange=\{\(event\) => onChange\(\{ \.\.\.draft, reference: event\.target\.value \}\)\}/);
});

console.log(`RH dossier contact labels: ${passed} passed`);

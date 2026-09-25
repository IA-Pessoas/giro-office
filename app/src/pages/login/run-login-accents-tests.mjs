import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.tsx"), "utf8");

const required = [
  "Gestão Integrada",
  "Todos os departamentos em um só lugar",
  "Segurança Total",
  "Login ou senha inválidos",
  "Não foi possível entrar agora. Tente novamente.",
  "um só lugar",
  "Sistema completo de gestão empresarial modular e inteligente",
  "Não tem conta?",
];

const forbidden = [
  'title: "Gestao Integrada"',
  'title: "Seguranca Total"',
  "um so lugar",
  "gestao empresarial",
  ">Modulos<",
  "Nao tem conta?",
  "senha invalidos",
  "Nao foi possivel entrar",
  // Estatísticas fictícias removidas (#1371).
  "99.9%",
  "Uptime",
  "24/7",
];

for (const text of required) {
  assert.ok(source.includes(text), `missing accented string: ${text}`);
}

for (const text of forbidden) {
  assert.ok(!source.includes(text), `unaccented string still present: ${text}`);
}

console.log("login accents tests passed");

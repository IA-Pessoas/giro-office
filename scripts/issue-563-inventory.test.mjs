import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const inventoryPath = new URL("../docs/security/permissions-0-3-inventory.md", import.meta.url);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("o inventário da issue 563 cobre os contratos obrigatórios", () => {
  const inventory = readFileSync(inventoryPath, "utf8");

  for (const heading of [
    "## Matriz de contratos e consumidores",
    "## Módulos ativos",
    "## Consumidores de módulos removidos",
    "## JWT, headers e sessão",
    "## Alteração de permissões e auditoria",
    "## Riscos de implantação parcial",
    "## Plano objetivo por sub-issue",
  ]) {
    assert.match(inventory, new RegExp(escapeRegExp(heading)));
  }

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
    "atendimento",
    "pec",
    "wiki",
  ]) {
    assert.match(inventory, new RegExp(`\\b${moduleKey}\\b`));
  }

  for (const targetIssue of [564, 565, 566, 567]) {
    assert.match(inventory, new RegExp(`#${targetIssue}\\b`));
  }
});

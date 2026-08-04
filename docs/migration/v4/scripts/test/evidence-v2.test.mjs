import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { V2_EVIDENCE } from "../evidence/v2.mjs";
import { validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";
import { buildRuleRegistry } from "../rules/index.mjs";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const V2_SOURCE_TABLES = [
  "tb_admin.departamentos",
  "tb_admin.usuarios",
  "tb_rh.colaboradores",
  "tb_integracao.clientes",
  "tb_regularize.clientes",
  "tb_integracao.prospeccao_comercial",
  "tb_integracao.tarefas_express",
  "tb_integracao.planos",
  "tb_integracao.tarefas_planos",
  "tb_integracao.tarefas",
  "tb_regularize.alvaras",
  "tb_regularize.processos",
  "tb_regularize.orientaoes_processual",
  "tb_regularize.orientaoes_processual.socios",
  "tb_regularize.taxas_municipais",
  "tb_regularize.clientes_senhas",
];

function parseReference(reference) {
  const match = reference.match(/^(.+):(\d+)$/);
  assert.ok(match, `referência sem linha auditável: ${reference}`);
  return { file: match[1], line: Number(match[2]) };
}

async function assertReferenceExists(root, reference) {
  const { file, line } = parseReference(reference);
  const content = await readFile(path.join(root, file), "utf8");
  assert.ok(content.split(/\r?\n/)[line - 1]?.trim().length > 0, reference);
}

test("V2_EVIDENCE confirma exatamente as 16 origens e corresponde às regras registradas", () => {
  const registry = buildRuleRegistry();

  assert.equal(V2_EVIDENCE.length, 16);
  assert.deepEqual(
    V2_EVIDENCE.map(({ sourceTable }) => sourceTable),
    V2_SOURCE_TABLES,
  );
  assert.doesNotThrow(() =>
    validateEvidenceCoverage(
      { decisions: V2_EVIDENCE },
      { tables: V2_SOURCE_TABLES.map((sourceTable) => ({ sourceTable })) },
    ),
  );

  for (const decision of V2_EVIDENCE) {
    assert.equal(decision.finalStatus, "confirmed", decision.sourceTable);
    assert.equal(decision.confidence, "high", decision.sourceTable);
    assert.equal(decision.ruleId, `v2:${decision.sourceTable}`);
    assert.equal(registry.get(decision.sourceTable)?.ruleOrigin, decision.ruleId);
    assert.deepEqual(registry.get(decision.sourceTable)?.evidence, {
      legacy: decision.legacyReferences,
      current: decision.currentContractEvidence,
    });
  }
});

test("cada decisão V2 referencia código legado e contrato atual reais", async () => {
  for (const decision of V2_EVIDENCE) {
    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);

    for (const reference of decision.legacyReferences) {
      await assertReferenceExists(LEGACY_ROOT, reference);
    }
    for (const reference of decision.currentContractEvidence) {
      const { file } = parseReference(reference);
      assert.match(file, /^(infra\/prisma|services\/)/, reference);
      await assertReferenceExists(process.cwd(), reference);
    }
  }
});

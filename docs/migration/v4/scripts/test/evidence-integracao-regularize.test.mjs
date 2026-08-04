import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { V2_EVIDENCE } from "../evidence/v2.mjs";
import { createPendingMapping } from "../lib/mapping-contract.mjs";
import { validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const evidenceModule = await import("../evidence/integracao-regularize.mjs").catch(() => null);
const rulesModule = await import("../rules/index.mjs").catch(() => null);

const CONFIRMED_SOURCE_TABLES = [
  "tb_integracao.grupos",
  "tb_integracao.pa",
  "tb_integracao.pa_historicos",
  "tb_integracao.tarefas_dependentes",
  "tb_integracao.tarefas_distrato",
  "tb_integracao.tarefas_express_distrato",
  "tb_integracao.tarefas_regularize",
  "tb_regularize.grupos",
  "tb_regularize.grupos_integrantes",
  "tb_regularize.orientaoes_processual.atividades",
  "tb_regularize.pf",
  "tb_regularize.pf_empresas",
  "tb_regularize.vencimento",
];

function implementation() {
  assert.ok(evidenceModule, "evidência Integração/Regularize ainda não implementada");
  assert.ok(rulesModule, "registry Integração/Regularize ainda não implementado");
  return { ...evidenceModule, ...rulesModule };
}

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

test("deriva 69 origens restantes ao subtrair V2 das 82 origens reais", async () => {
  const { INTEGRACAO_REGULARIZE_EVIDENCE, INTEGRACAO_REGULARIZE_SOURCE_TABLES } = implementation();
  const v2Sources = new Set(V2_EVIDENCE.map(({ sourceTable }) => sourceTable));
  const expected = (await readdir(LEGACY_DUMP_ROOT))
    .filter(
      (file) =>
        /^(tb_integracao|tb_regularize)\..*\.sql$/.test(file) && !v2Sources.has(file.slice(0, -4)),
    )
    .map((file) => file.slice(0, -4))
    .sort();
  const allDomainSources = (await readdir(LEGACY_DUMP_ROOT)).filter((file) =>
    /^(tb_integracao|tb_regularize)\..*\.sql$/.test(file),
  );

  assert.equal(allDomainSources.length, 82);
  assert.equal(
    V2_EVIDENCE.filter(({ sourceTable }) => /^(tb_integracao|tb_regularize)\./.test(sourceTable))
      .length,
    13,
  );
  assert.equal(expected.length, 69);
  assert.deepEqual(INTEGRACAO_REGULARIZE_SOURCE_TABLES, expected);
  assert.deepEqual(
    INTEGRACAO_REGULARIZE_EVIDENCE.map(({ sourceTable }) => sourceTable),
    expected,
  );
  assert.doesNotThrow(() =>
    validateEvidenceCoverage(
      { decisions: INTEGRACAO_REGULARIZE_EVIDENCE },
      { tables: expected.map((sourceTable) => ({ sourceTable })) },
    ),
  );
});

test("somente 13 decisões comprovadas possuem regra; 56 pending não sugerem destino", () => {
  const { INTEGRACAO_REGULARIZE_EVIDENCE, INTEGRACAO_REGULARIZE_RULES, buildRuleRegistry } =
    implementation();
  const registry = buildRuleRegistry(INTEGRACAO_REGULARIZE_RULES);
  const confirmed = INTEGRACAO_REGULARIZE_EVIDENCE.filter(
    ({ finalStatus }) => finalStatus === "confirmed",
  );
  const pending = INTEGRACAO_REGULARIZE_EVIDENCE.filter(
    ({ finalStatus }) => finalStatus === "pending",
  );

  assert.deepEqual(
    confirmed.map(({ sourceTable }) => sourceTable),
    CONFIRMED_SOURCE_TABLES,
  );
  assert.equal(confirmed.length, 13);
  assert.equal(pending.length, 56);
  assert.equal(INTEGRACAO_REGULARIZE_RULES.length, 13);

  for (const decision of confirmed) {
    const mappingRule = registry.get(decision.sourceTable);
    assert.ok(mappingRule, decision.sourceTable);
    assert.equal(decision.ruleId, `integracao-regularize:${decision.sourceTable}`);
    assert.equal(mappingRule.ruleOrigin, decision.ruleId);
    assert.deepEqual(mappingRule.evidence, {
      legacy: decision.legacyReferences,
      current: decision.currentContractEvidence,
    });
  }

  for (const decision of pending) {
    assert.equal(decision.ruleId, null, decision.sourceTable);
    assert.equal(registry.has(decision.sourceTable), false, decision.sourceTable);
    const pendingMapping = createPendingMapping(
      { sourceTable: decision.sourceTable, rowCount: 0 },
      decision,
    );
    assert.equal(pendingMapping.status, "pending");
    assert.equal("destinations" in pendingMapping, false);
    assert.equal("emitRows" in pendingMapping, false);
  }
});

test("evidência cita arquivos reais e confirmação cita contrato atual real", async () => {
  const { INTEGRACAO_REGULARIZE_EVIDENCE } = implementation();

  for (const decision of INTEGRACAO_REGULARIZE_EVIDENCE) {
    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    for (const reference of decision.legacyReferences) {
      await assertReferenceExists(LEGACY_ROOT, reference);
    }
    if (decision.finalStatus === "confirmed") {
      assert.ok(decision.operations.length > 0, decision.sourceTable);
      assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);
      assert.ok(["high", "medium"].includes(decision.confidence), decision.sourceTable);
      for (const reference of decision.currentContractEvidence) {
        const { file } = parseReference(reference);
        assert.match(file, /^(infra\/prisma|services\/)/, reference);
        await assertReferenceExists(process.cwd(), reference);
      }
    } else {
      assert.match(
        decision.reasonCode,
        /NO_CURRENT_CONTRACT|CURRENT_CONTRACT_NOT_FAITHFUL|NO_INDEPENDENT_DESTINATION|NO_LEGACY_CODE_REFERENCE/,
      );
      assert.doesNotMatch(decision.reason, /criar|nova tabela|novo serviço/i);
    }
  }
});

test("agenda materializada, DTE, anexos e controles permanecem pending sem destino fabricado", () => {
  const { INTEGRACAO_REGULARIZE_EVIDENCE } = implementation();
  const requiredPending = [
    "tb_regularize.dte",
    "tb_regularize.dte_status",
    "tb_regularize.agenda",
    "tb_regularize.atividades",
    "tb_regularize.sites_estado",
    "tb_regularize.sites_prefeituras",
    "tb_integracao.agenda_status",
    "tb_integracao.tarefas_docs",
    "tb_integracao.tarefas_imagens",
    "tb_regularize.agenda_controle",
  ];

  for (const sourceTable of requiredPending) {
    const decision = INTEGRACAO_REGULARIZE_EVIDENCE.find(
      (candidate) => candidate.sourceTable === sourceTable,
    );
    assert.ok(decision, sourceTable);
    assert.equal(decision.finalStatus, "pending", sourceTable);
    assert.equal(decision.ruleId, null, sourceTable);
  }
});

test("catálogo de distrato preserva TaskModel e agenda não fabrica série recorrente", () => {
  const { INTEGRACAO_REGULARIZE_EVIDENCE } = implementation();
  const catalog = INTEGRACAO_REGULARIZE_EVIDENCE.find(
    ({ sourceTable }) => sourceTable === "tb_integracao.tarefas_express_distrato",
  );
  const agenda = INTEGRACAO_REGULARIZE_EVIDENCE.find(
    ({ sourceTable }) => sourceTable === "tb_regularize.agenda",
  );

  assert.equal(catalog?.finalStatus, "confirmed");
  assert.equal(catalog?.ruleId, "integracao-regularize:tb_integracao.tarefas_express_distrato");
  assert.match(catalog?.reason ?? "", /catálogo|modelo/i);
  assert.deepEqual(catalog?.currentContractEvidence, [
    "infra/prisma/schema.prisma:774",
    "services/task-service/src/services/taskModelService.ts:117",
  ]);

  assert.equal(agenda?.finalStatus, "pending");
  assert.equal(agenda?.ruleId, null);
  assert.equal(agenda?.reasonCode, "CURRENT_CONTRACT_NOT_FAITHFUL");
  assert.match(agenda?.reason ?? "", /materializad|série|recorr/i);
  assert.deepEqual(agenda?.currentContractEvidence, []);
});

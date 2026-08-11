import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  RH_PESSOAL_EVIDENCE,
  RH_PESSOAL_PENDING_COLUMN_DECISIONS,
  RH_PESSOAL_SOURCE_TABLES,
} from "../evidence/rh-pessoal.mjs";
import { createPendingMapping } from "../lib/mapping-contract.mjs";
import { validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";
import { buildRuleRegistry, RH_PESSOAL_RULES } from "../rules/index.mjs";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

const CONFIRMED_SOURCE_TABLES = [
  "tb_pessoal.bem",
  "tb_pessoal.bsf",
  "tb_pessoal.clientes_situacoes",
  "tb_pessoal.codigos_acesso",
  "tb_pessoal.contri_assis",
  "tb_pessoal.empregador_web",
  "tb_pessoal.folhas",
  "tb_pessoal.ldd",
  "tb_pessoal.obrigacoes",
  "tb_pessoal.sindicato",
  "tb_rh.alergias",
  "tb_rh.contatos_emergencia",
  "tb_rh.feriados",
  "tb_rh.pontos",
  "tb_rh.pontos_adicionais_folhas",
  "tb_rh.pontos_folhas",
  "tb_rh.pontos_registros",
  "tb_rh.pontos_solicitacoes",
  "tb_rh.score",
  "tb_rh.score_avaliacoes",
  "tb_rh.score_nitro",
  "tb_rh.score_perguntas",
  "tb_rh.solicitacoes",
  "tb_rh.solicitacoes_categorias",
  "tb_rh.solicitacoes_mensagens",
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

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("evidência RH/Pessoal cobre exatamente as 49 origens reais ainda fora da V2", async () => {
  const dumpFiles = await readdir(LEGACY_DUMP_ROOT);
  const expected = dumpFiles
    .filter((file) => /^(tb_rh|tb_pessoal)\..*\.sql$/.test(file))
    .map((file) => file.slice(0, -".sql".length))
    .filter((sourceTable) => sourceTable !== "tb_rh.colaboradores")
    .sort();

  assert.equal(expected.length, 49);
  assert.deepEqual(RH_PESSOAL_SOURCE_TABLES, expected);
  assert.deepEqual(
    RH_PESSOAL_EVIDENCE.map(({ sourceTable }) => sourceTable),
    expected,
  );
  assert.doesNotThrow(() =>
    validateEvidenceCoverage(
      { decisions: RH_PESSOAL_EVIDENCE },
      { tables: expected.map((sourceTable) => ({ sourceTable })) },
    ),
  );
});

test("somente as 25 decisões confirmed possuem regra e as 24 pending não sugerem destino", () => {
  const combinedRegistry = buildRuleRegistry(RH_PESSOAL_RULES);
  const confirmed = RH_PESSOAL_EVIDENCE.filter(({ finalStatus }) => finalStatus === "confirmed");
  const pending = RH_PESSOAL_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.deepEqual(
    confirmed.map(({ sourceTable }) => sourceTable),
    CONFIRMED_SOURCE_TABLES,
  );
  assert.equal(confirmed.length, 25);
  assert.equal(pending.length, 24);
  assert.equal(RH_PESSOAL_RULES.length, 25);

  for (const decision of confirmed) {
    const mappingRule = combinedRegistry.get(decision.sourceTable);
    assert.ok(mappingRule, decision.sourceTable);
    assert.equal(decision.ruleId, `rh-pessoal:${decision.sourceTable}`);
    assert.equal(mappingRule.ruleOrigin, decision.ruleId);
    assert.deepEqual(mappingRule.evidence, {
      legacy: decision.legacyReferences,
      current: decision.currentContractEvidence,
    });
  }

  for (const decision of pending) {
    assert.equal(decision.ruleId, null, decision.sourceTable);
    assert.equal(combinedRegistry.has(decision.sourceTable), false, decision.sourceTable);
    const pendingMapping = createPendingMapping(
      { sourceTable: decision.sourceTable, rowCount: 0 },
      decision,
    );
    assert.equal(pendingMapping.status, "pending");
    assert.equal("destinations" in pendingMapping, false);
    assert.equal("emitRows" in pendingMapping, false);
  }
});

test("cada origem possui evidência legada real e toda confirmação cita contrato atual real", async () => {
  for (const decision of RH_PESSOAL_EVIDENCE) {
    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    assert.ok(decision.operations.length > 0, decision.sourceTable);

    for (const reference of decision.legacyReferences) {
      await assertReferenceExists(LEGACY_ROOT, reference);
    }

    if (decision.finalStatus === "confirmed") {
      assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);
      assert.ok(["high", "medium"].includes(decision.confidence), decision.sourceTable);
      for (const reference of decision.currentContractEvidence) {
        const { file } = parseReference(reference);
        assert.match(file, /^(infra\/prisma|services\/)/, reference);
        await assertReferenceExists(process.cwd(), reference);
      }
    } else {
      assert.match(decision.reasonCode, /NO_CURRENT_CONTRACT|NO_INDEPENDENT_DESTINATION/);
      assert.doesNotMatch(decision.reason, /quarantine.only|V3/i);
    }
  }
});

test("toda coluna das 24 origens pending é explicitamente not_preserved com motivo objetivo", async () => {
  const pending = RH_PESSOAL_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");
  assert.deepEqual(
    Object.keys(RH_PESSOAL_PENDING_COLUMN_DECISIONS).sort(),
    pending.map(({ sourceTable }) => sourceTable),
  );

  for (const evidenceDecision of pending) {
    const sourceColumns = await inspectDeclaredColumns(evidenceDecision.sourceTable);
    const columnDecisions = RH_PESSOAL_PENDING_COLUMN_DECISIONS[evidenceDecision.sourceTable];
    assert.deepEqual(
      columnDecisions.map(({ sourceColumn }) => sourceColumn).sort(),
      sourceColumns.sort(),
      evidenceDecision.sourceTable,
    );
    for (const columnDecision of columnDecisions) {
      assert.equal(columnDecision.status, "not_preserved");
      assert.equal(columnDecision.destinationColumn, null);
      assert.ok(columnDecision.reason.length >= 30);
      assert.doesNotMatch(columnDecision.reason, /quarantine.only|V3/i);
    }
  }
});

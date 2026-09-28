import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ALL_EVIDENCE,
  buildEvidenceRegistry,
  NO_LEGACY_RUNTIME_REFERENCE_SOURCES,
  REMAINING_EVIDENCE,
  REMAINING_PENDING_COLUMN_DECISIONS,
} from "../evidence/index.mjs";
import { createPendingMapping } from "../lib/mapping-contract.mjs";
import { validateEvidenceCoverage } from "../lib/semantic-evidence.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import { buildTriageClientSlotContexts, createV2ClientIdentityResolver } from "../rules/index.mjs";

const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

async function inventorySources() {
  return (await readdir(DUMP_ROOT))
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => fileName.slice(0, -4))
    .sort();
}

function parseReference(reference) {
  const match = reference.match(/^(.+):(\d+)$/);
  assert.ok(match, `referência sem linha auditável: ${reference}`);
  return { file: match[1], line: Number(match[2]) };
}

async function declaredColumns(sourceTable) {
  const dump = await readFile(path.join(DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const body = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1] ?? "";
  return [...body.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

async function loadRows(sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(path.join(DUMP_ROOT, `${sourceTable}.sql`))) {
    rows.push(row);
  }
  return rows;
}

test("a união final cobre exatamente as 312 origens do inventário sem colisões", async () => {
  const expected = await inventorySources();
  const actual = ALL_EVIDENCE.map(({ sourceTable }) => sourceTable);

  assert.equal(expected.length, 312);
  assert.equal(ALL_EVIDENCE.length, 312);
  assert.equal(new Set(actual).size, 312);
  assert.deepEqual(actual, expected);
  assert.doesNotThrow(() =>
    validateEvidenceCoverage(
      { decisions: ALL_EVIDENCE },
      { tables: expected.map((sourceTable) => ({ sourceTable })) },
    ),
  );
});

test("o complemento é derivado das evidências anteriores e contém exatamente 87 origens", async () => {
  const expected = await inventorySources();
  const remaining = new Set(REMAINING_EVIDENCE.map(({ sourceTable }) => sourceTable));
  const previous = ALL_EVIDENCE.filter(({ sourceTable }) => !remaining.has(sourceTable));
  const previousSources = new Set(previous.map(({ sourceTable }) => sourceTable));
  const expectedRemaining = expected.filter((sourceTable) => !previousSources.has(sourceTable));

  assert.equal(previous.length, 225);
  assert.equal(REMAINING_EVIDENCE.length, 87);
  assert.deepEqual(
    REMAINING_EVIDENCE.map(({ sourceTable }) => sourceTable),
    expectedRemaining,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        Object.groupBy(REMAINING_EVIDENCE, ({ sourceTable }) => sourceTable.split(".")[0]),
      ).map(([prefix, decisions]) => [prefix, decisions.length]),
    ),
    {
      tb: 1,
      tb_cbc: 10,
      tb_cbs: 10,
      tb_historico: 37,
      tb_mkt: 8,
      tb_pec: 1,
      tb_triagem: 5,
      tb_wiki: 5,
      tb_workspace: 10,
    },
  );
});

test("buildEvidenceRegistry rejeita colisão e pending sem motivo ou evidência", () => {
  const validPending = {
    sourceTable: "legacy.aux",
    legacyModule: "fixture",
    legacyReferences: ["fixture.php:1"],
    operations: ["select"],
    legacyRelationships: ["lookup auxiliar"],
    currentContractEvidence: [],
    finalStatus: "pending",
    reasonCode: "LEGACY_AUXILIARY_NO_CURRENT_CONTRACT",
    reason: "Não existe contrato atual fiel para a entidade auxiliar.",
    confidence: "low",
    ruleId: null,
  };

  assert.equal(buildEvidenceRegistry([[validPending]]).size, 1);
  assert.throws(() => buildEvidenceRegistry([[validPending], [validPending]]), /duplicada/i);
  assert.throws(
    () => buildEvidenceRegistry([[{ ...validPending, legacyReferences: [] }]]),
    /evidência/i,
  );
  assert.throws(() => buildEvidenceRegistry([[{ ...validPending, reason: "" }]]), /motivo/i);
});

test("as oito origens sem runtime ficam pending com o motivo canônico", () => {
  const expected = [
    "tb_atendimento.motoboy",
    "tb_contabil.bancos",
    "tb_contabil.clientes_bancos_temp",
    "tb_contabil.documentos_bancos",
    "tb_fiscal.sn_completo_sn",
    "tb_historico",
    "tb_integracao.admin_tarefas",
    "tb_integracao.cobrancas_solucoes",
  ];
  const bySource = new Map(ALL_EVIDENCE.map((decision) => [decision.sourceTable, decision]));

  assert.deepEqual(NO_LEGACY_RUNTIME_REFERENCE_SOURCES, expected);
  for (const sourceTable of expected) {
    const decision = bySource.get(sourceTable);
    assert.ok(decision, sourceTable);
    assert.equal(decision.finalStatus, "pending", sourceTable);
    assert.equal(decision.reasonCode, "NO_LEGACY_RUNTIME_REFERENCE", sourceTable);
    assert.equal(decision.ruleId, null, sourceTable);
    assert.match(decision.reason, /runtime/i, sourceTable);
  }
});

test("toda decisão restante possui referência auditável e pending preserva colunas sem destino", async () => {
  const pending = REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");
  assert.equal(
    REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "confirmed").length,
    16,
  );
  assert.equal(pending.length, 71);
  assert.deepEqual(
    Object.keys(REMAINING_PENDING_COLUMN_DECISIONS).sort(),
    pending.map(({ sourceTable }) => sourceTable),
  );

  for (const decision of REMAINING_EVIDENCE) {
    assert.ok(decision.legacyReferences.length > 0, decision.sourceTable);
    for (const reference of decision.legacyReferences) {
      const { file, line } = parseReference(reference);
      const content = await readFile(path.join(LEGACY_ROOT, file), "utf8");
      assert.ok(content.split(/\r?\n/)[line - 1]?.trim().length > 0, reference);
    }

    if (decision.finalStatus === "confirmed") {
      assert.ok(decision.currentContractEvidence.length > 0, decision.sourceTable);
      for (const reference of decision.currentContractEvidence) {
        const { file, line } = parseReference(reference);
        const content = await readFile(file, "utf8");
        assert.ok(content.split(/\r?\n/)[line - 1]?.trim().length > 0, reference);
      }
      assert.equal(decision.ruleId, `remaining:${decision.sourceTable}`);
      continue;
    }

    const pendingMapping = createPendingMapping(
      { sourceTable: decision.sourceTable, rowCount: 0 },
      decision,
    );
    assert.equal("destinations" in pendingMapping, false, decision.sourceTable);
    const expectedColumns = await declaredColumns(decision.sourceTable);
    const columns = REMAINING_PENDING_COLUMN_DECISIONS[decision.sourceTable];
    assert.deepEqual(
      columns.map(({ sourceColumn }) => sourceColumn).sort(),
      expectedColumns.sort(),
      decision.sourceTable,
    );
    for (const column of columns) {
      assert.equal(column.status, "not_preserved");
      assert.equal(column.destinationColumn, null);
      assert.equal(column.transformation, "not_emitted_pending_mapping");
      assert.ok(column.reason.length >= 30);
    }
  }
});

test("históricos e auxiliares sem contrato de replay usam reasons específicos", () => {
  for (const decision of REMAINING_EVIDENCE) {
    if (
      decision.sourceTable.startsWith("tb_historico") &&
      decision.sourceTable !== "tb_historico"
    ) {
      assert.equal(decision.finalStatus, "pending", decision.sourceTable);
      assert.equal(decision.reasonCode, "LEGACY_HISTORY_NO_REPLAY_CONTRACT", decision.sourceTable);
    }
  }

  for (const sourceTable of [
    "tb_cbs.estoque_andares",
    "tb_cbs.estoque_categorias_itens",
    "tb_cbs.estoque_itens",
    "tb_triagem.justificativas",
  ]) {
    const decision = REMAINING_EVIDENCE.find((item) => item.sourceTable === sourceTable);
    assert.equal(decision?.finalStatus, "pending", sourceTable);
    assert.equal(decision?.reasonCode, "LEGACY_AUXILIARY_NO_CURRENT_CONTRACT", sourceTable);
  }
});

test("operações complementares preservam referências específicas de delete e select", () => {
  const bySource = new Map(REMAINING_EVIDENCE.map((decision) => [decision.sourceTable, decision]));
  const emails = bySource.get("tb_cbc.emails");
  assert.ok(emails?.operations.includes("delete"));
  assert.ok(emails?.legacyReferences.includes("classes/Emails.php:178"));

  const messages = bySource.get("tb_workspace.solicitacoes_mensagens");
  assert.ok(messages?.operations.includes("select"));
  assert.ok(messages?.legacyReferences.includes("classes/Solicitacao.php:569"));
});

test("ramais sem tipo fiel ficam pending e orçamento documenta o contrato parcial real", async () => {
  const bySource = new Map(REMAINING_EVIDENCE.map((decision) => [decision.sourceTable, decision]));
  const extensions = bySource.get("tb_cbs.ramais");
  assert.equal(extensions?.finalStatus, "pending");
  assert.equal(extensions?.reasonCode, "FUNCTIONAL_FIELD_NO_CURRENT_DESTINATION");
  assert.match(extensions?.reason ?? "", /tipo.*Móvel.*Fixo.*Computador/i);
  const extensionRows = await loadRows("tb_cbs.ramais");
  assert.equal(extensionRows.length, 194);
  assert.deepEqual(
    Object.fromEntries(
      [...Map.groupBy(extensionRows, ({ tipo }) => tipo)].map(([type, rows]) => [
        type,
        rows.length,
      ]),
    ),
    { Móvel: 14, Fixo: 90, Computador: 90 },
  );

  const budgets = bySource.get("tb_cbc.orcamentos");
  assert.equal(budgets?.finalStatus, "pending");
  assert.ok(budgets.currentContractEvidence.includes("infra/prisma/schema.prisma:1078"));
  assert.ok(
    budgets.currentContractEvidence.includes("services/src/src/services/BudgetService.ts:45"),
  );
  assert.match(budgets.reason, /parcial.*Budget.*items.*JSON.*categoria/i);
  assert.equal((await loadRows("tb_cbc.orcamentos")).length, 510);
});

test("evidence confirmed registra subsets reais obrigatórios de quarantine sem equivalência plena", async () => {
  const bySource = new Map(REMAINING_EVIDENCE.map((decision) => [decision.sourceTable, decision]));
  const exitRows = await loadRows("tb_cbs.estoque_saidas");
  const exitsWithObservation = exitRows.filter((row) => String(row.obs).trim().length > 0);
  assert.equal(exitRows.length, 3000);
  assert.equal(exitsWithObservation.length, 1807);
  const exits = bySource.get("tb_cbs.estoque_saidas");
  assert.match(exits.reason, /1\.807.*obs.*quarentena/i);
  assert.match(exits.reason, /não.*equivalência plena/i);

  const [triageRows, regularizeRows, integrationRows] = await Promise.all([
    loadRows("tb_triagem.campos"),
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
  ]);
  const functionalIndexes = triageRows.flatMap((row, index) =>
    !["", "0"].includes(String(row.faturamento).trim()) || String(row.envio).trim().length > 0
      ? [index]
      : [],
  );
  assert.equal(functionalIndexes.length, 307);
  const clientResolver = createV2ClientIdentityResolver({ regularizeRows, integrationRows });
  const triageContexts = buildTriageClientSlotContexts({ rows: triageRows, clientResolver });
  assert.equal(
    functionalIndexes.filter(
      (index) => triageContexts[index].resolutions.clientSlot.state === "conflict",
    ).length,
    5,
  );
  const triage = bySource.get("tb_triagem.campos");
  assert.match(triage.reason, /307.*faturamento.*envio.*quarentena/i);
  assert.match(triage.reason, /5.*conflito.*blockers/i);

  const passwordRows = await loadRows("tb_mkt.senhas");
  const secretObservationRows = passwordRows.filter((row) => {
    const password = String(row.password).trim();
    const observation = String(row.obs).trim();
    return password.length > 0 && observation.includes(password);
  });
  assert.equal(passwordRows.length, 54);
  assert.equal(secretObservationRows.length, 2);
  const passwords = bySource.get("tb_mkt.senhas");
  assert.match(passwords.reason, /2.*54.*obs.*segredo.*quarentena/i);

  const messageRows = await loadRows("tb_workspace.solicitacoes_mensagens");
  assert.equal(messageRows.length, 2);
  assert.deepEqual(messageRows.map(({ tipo }) => tipo).sort(), ["0", "6"]);
  assert.equal(messageRows.find(({ tipo }) => tipo === "6")?.mensagem, "");
  await readFile(path.join(LEGACY_ROOT, "uploads/Workspace/solicitacoes/67ea8f65eca6d.pdf"));
  const messages = bySource.get("tb_workspace.solicitacoes_mensagens");
  assert.match(messages.reason, /2.*quarentena/i);
  assert.match(messages.reason, /tipo 6.*vazi.*PDF.*não.*migrável/i);
  assert.doesNotMatch(messages.reason, /capacidade explícita.*suficiente/i);
  assert.ok(messages.legacyReferences.includes("classes/Solicitacao.php:550"));
  assert.ok(messages.currentContractEvidence.includes("infra/prisma/schema.prisma:2028"));
});

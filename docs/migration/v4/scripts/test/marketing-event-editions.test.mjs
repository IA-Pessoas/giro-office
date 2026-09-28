import assert from "node:assert/strict";
import test from "node:test";
import { CASTELO_ORGANIZATION_ID, validateMappingRule } from "../lib/mapping-contract.mjs";
import {
  getFieldByDatabaseName,
  getModelByDatabaseName,
  loadPrismaCatalog,
} from "../lib/prisma-catalog.mjs";
import { buildMarketingEventEditionContexts, REMAINING_RULES } from "../rules/remaining.mjs";
import { buildRemainingRuntimeState, REMAINING_EXECUTION_ENTRIES } from "../runtime/remaining.mjs";

const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

test("event editions are relationally scoped to their event and organization", () => {
  const edition = getModelByDatabaseName(catalog, "mtk.event_editions");
  assert.ok(edition, "mtk.event_editions model must exist");
  assert.ok(getFieldByDatabaseName(edition, "organization_id"));
  assert.ok(getFieldByDatabaseName(edition, "event_id"));
  assert.ok(getFieldByDatabaseName(edition, "legacy_id"));
  assert.ok(getFieldByDatabaseName(edition, "name"));
  assert.ok(getFieldByDatabaseName(edition, "date"));
  assert.ok(getFieldByDatabaseName(edition, "place"));
  assert.ok(edition.compoundUnique.some((fields) => fields.join(",") === "id,organization_id"));
});

test("budget rows use a scoped edition relation and exact decimal amounts", () => {
  const budget = getModelByDatabaseName(catalog, "mtk.event_edition_budget_items");
  assert.ok(budget, "mtk.event_edition_budget_items model must exist");
  assert.ok(getFieldByDatabaseName(budget, "organization_id"));
  assert.ok(getFieldByDatabaseName(budget, "edition_id"));
  assert.ok(getFieldByDatabaseName(budget, "legacy_id"));
  assert.equal(getFieldByDatabaseName(budget, "amount")?.prismaType, "Decimal");
  assert.ok(budget.fields.some((field) => field.relationModel === "MarketingEventEdition"));
  assert.ok(budget.compoundUnique.some((fields) => fields.join(",") === "id,organization_id"));
});

test("legacy editions and budget rows run through the migration runtime", async () => {
  const eventRow = {
    id: 7,
    nome: "Feira anual",
    logo: "",
    status: "Novo",
    prioridade: "Média",
    objetivo: "",
    publico: "",
  };
  const editionRow = {
    id: 19,
    evento_id: 7,
    nome: "Edição anual",
    orcamentos: [{ id: "budget-a1", nome: "Espaço", valor: "1250.50" }],
    data_local: "2026-11-12 | Castelo Branco",
    parcerias: [],
    organizacao: [],
    logistica: {},
    mkt_comunicacao: {},
    durante_evento: {},
    pos_evento: {},
    obs: "",
  };
  const sourceTable = "tb_mkt.eventos_edicoes";
  const editionRule = REMAINING_RULES.find((rule) => rule.sourceTable === sourceTable);
  assert.ok(editionRule);
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  assert.equal(validateMappingRule(editionRule, catalog), true);

  const contexts = buildMarketingEventEditionContexts({
    rows: [editionRow],
    eventRows: [eventRow],
  });
  const emissions = editionRule.emitRows(editionRow, contexts[0]);
  assert.deepEqual(
    emissions.map(({ stepId, status }) => ({ stepId, status })),
    [
      { stepId: "mkt-event-edition-insert", status: "prepared" },
      { stepId: "mkt-event-edition-budget-insert", status: "prepared" },
    ],
  );

  const runtime = buildRemainingRuntimeState({
    sourceRows: {
      "tb_mkt.eventos": [eventRow],
      [sourceTable]: [editionRow],
    },
  });
  const projected = REMAINING_EXECUTION_ENTRIES.filter(
    (entry) => entry.sourceTable === sourceTable,
  ).flatMap((entry) =>
    entry
      .emitRows(editionRow, runtime)
      .filter((emission) => emission.stepId === entry.stepId)
      .map((emission) => entry.projector(emission, editionRow, runtime)),
  );
  const edition = projected.find(({ event_id }) => event_id !== undefined);
  const [budget] = projected.filter(({ edition_id }) => edition_id !== undefined);
  const iterated = [];
  for await (const emission of runtime.iterateRows(sourceTable, [editionRow]))
    iterated.push(emission);

  assert.ok(edition);
  assert.ok(budget);
  assert.equal(edition.organization_id, CASTELO_ORGANIZATION_ID);
  assert.equal(edition.id, budget.edition_id);
  assert.equal(budget.amount, "1250.50");
  assert.deepEqual(
    iterated.map(({ stepId, status }) => ({ stepId, status })),
    [
      { stepId: "mkt-event-edition-insert", status: "prepared" },
      { stepId: "mkt-event-edition-budget-insert", status: "prepared" },
    ],
  );
});

test("ambiguous or unprepared event links produce migration quarantine emissions", () => {
  const eventRows = [
    { id: 7, nome: "Feira", prioridade: "Média", status: "Novo" },
    { id: 7, nome: "Feira alternativa", prioridade: "Média", status: "Novo" },
  ];
  const editionRow = {
    id: 19,
    evento_id: 7,
    nome: "Edição anual",
    orcamentos: [],
    data_local: "2026-11-12 | Castelo Branco",
  };
  const contexts = buildMarketingEventEditionContexts({ rows: [editionRow], eventRows });
  const editionRule = REMAINING_RULES.find((rule) => rule.sourceTable === "tb_mkt.eventos_edicoes");
  const emissions = editionRule.emitRows(editionRow, contexts[0]);

  assert.equal(emissions[0].status, "quarantine");
  assert.equal(emissions[0].reasonCode, "MKT_EDITION_EVENT_AMBIGUOUS");
  assert.equal(emissions[1].status, "quarantine");
});

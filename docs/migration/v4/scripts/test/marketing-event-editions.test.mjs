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

test("feedback period and evaluation are tenant scoped and one-to-one with a valid rating", () => {
  const edition = getModelByDatabaseName(catalog, "mtk.event_editions");
  assert.equal(getFieldByDatabaseName(edition, "feedback_period_start")?.prismaType, "DateTime");
  assert.equal(getFieldByDatabaseName(edition, "feedback_period_end")?.prismaType, "DateTime");

  const feedback = getModelByDatabaseName(catalog, "mtk.event_edition_feedback");
  assert.ok(feedback, "feedback model must exist");
  assert.ok(getFieldByDatabaseName(feedback, "organization_id"));
  assert.ok(getFieldByDatabaseName(feedback, "edition_id"));
  assert.equal(getFieldByDatabaseName(feedback, "rating")?.prismaType, "Int");
  assert.ok(getFieldByDatabaseName(feedback, "observation")?.nullable);
  assert.equal(getFieldByDatabaseName(feedback, "evaluated_at")?.prismaType, "DateTime");
  assert.ok(feedback.compoundUnique.some((fields) => fields.join(",") === "edition_id,organization_id"));
  assert.ok(feedback.fields.some((field) => field.relationModel === "MarketingEventEdition"));
});

test("legacy feedback tables emit period updates and one relational evaluation", () => {
  const eventRow = { id: 7, nome: "Feira anual", logo: "", status: "Novo", prioridade: "Média", objetivo: "", publico: "" };
  const editionRow = {
    id: 19,
    evento_id: 7,
    nome: "Edição anual",
    orcamentos: [],
    data_local: "2026-11-12 | Castelo Branco",
    parcerias: [],
    organizacao: [],
    logistica: {},
    mkt_comunicacao: {},
    durante_evento: {},
    pos_evento: {},
    obs: "",
  };
  const periodRow = { edicao: 19, inicio: "2026-10-01 09:00:00", fim: "2026-10-30 18:00:00" };
  const feedbackRow = {
    id: 81,
    edicao_id: 19,
    data: "2026-11-01 12:30:00",
    user_id: 44,
    nota: 5,
    obs: "Ótima organização",
    valido: 1,
  };
  const runtime = buildRemainingRuntimeState({
    sourceRows: {
      "tb_mkt.eventos": [eventRow],
      "tb_mkt.eventos_edicoes": [editionRow],
      "tb_mkt.eventos_feedbacks_periodos": [periodRow],
      "tb_mkt.eventos_feedbacks": [feedbackRow],
    },
  });
  const periodEntry = REMAINING_EXECUTION_ENTRIES.find(
    (entry) => entry.sourceTable === "tb_mkt.eventos_feedbacks_periodos",
  );
  const feedbackEntry = REMAINING_EXECUTION_ENTRIES.find(
    (entry) => entry.sourceTable === "tb_mkt.eventos_feedbacks",
  );

  assert.ok(periodEntry, "period import rule must exist");
  assert.ok(feedbackEntry, "evaluation import rule must exist");
  const periodEmission = periodEntry.emitRows(periodRow, runtime)[0];
  const feedbackEmission = feedbackEntry.emitRows(feedbackRow, runtime)[0];
  assert.equal(periodEmission.status, "prepared");
  assert.equal(feedbackEmission.status, "prepared");
  assert.equal(periodEmission.destinationTable, "mtk.event_editions");
  assert.equal(feedbackEmission.destinationTable, "mtk.event_edition_feedback");
  const period = periodEntry.projector(periodEmission, periodRow, runtime);
  const feedback = feedbackEntry.projector(feedbackEmission, feedbackRow, runtime);
  const editionId = runtime.contextFor("tb_mkt.eventos_edicoes", editionRow)
    .resolutions.event.importPlan.edition.id;
  assert.equal(period.id, editionId);
  assert.equal(period.feedback_period_start, "2026-10-01T09:00:00.000Z");
  assert.equal(period.feedback_period_end, "2026-10-30T18:00:00.000Z");
  assert.equal(feedback.rating, 5);
  assert.equal(feedback.observation, "Ótima organização");
  assert.equal(feedback.evaluated_at, "2026-11-01T12:30:00.000Z");
});

test("feedback rules satisfy destination contracts and quarantine unresolved or duplicate links", async () => {
  const periodSource = "tb_mkt.eventos_feedbacks_periodos";
  const feedbackSource = "tb_mkt.eventos_feedbacks";
  const periodRule = REMAINING_RULES.find((rule) => rule.sourceTable === periodSource);
  const feedbackRule = REMAINING_RULES.find((rule) => rule.sourceTable === feedbackSource);
  assert.ok(periodRule);
  assert.ok(feedbackRule);
  assert.equal(validateMappingRule(periodRule, catalog), true);
  assert.equal(validateMappingRule(feedbackRule, catalog), true);

  const eventRow = { id: 7, nome: "Feira anual", status: "Novo", prioridade: "Média" };
  const editionRow = {
    id: 19,
    evento_id: 7,
    nome: "Edição anual",
    orcamentos: [],
    data_local: "2026-11-12 | Castelo Branco",
  };
  const missingPeriod = { edicao: 404, inicio: "2026-10-01 09:00:00", fim: "2026-10-30 18:00:00" };
  const validEvaluation = {
    id: 81,
    edicao_id: 19,
    data: "2026-11-01 12:30:00",
    nota: 5,
    obs: "Boa edição",
    valido: 1,
  };
  const duplicateEvaluation = { ...validEvaluation, id: 82, nota: 4 };
  const ambiguousEditions = [editionRow, { ...editionRow, nome: "Edição duplicada" }];
  const runtime = buildRemainingRuntimeState({
    sourceRows: {
      "tb_mkt.eventos": [eventRow],
      "tb_mkt.eventos_edicoes": ambiguousEditions,
      [periodSource]: [missingPeriod],
      [feedbackSource]: [validEvaluation, duplicateEvaluation],
    },
  });

  const periodEntry = REMAINING_EXECUTION_ENTRIES.find((entry) => entry.sourceTable === periodSource);
  const feedbackEntry = REMAINING_EXECUTION_ENTRIES.find(
    (entry) => entry.sourceTable === feedbackSource,
  );
  const periodDecision = periodEntry.emitRows(missingPeriod, runtime)[0];
  const feedbackDecisions = [validEvaluation, duplicateEvaluation].map(
    (row) => feedbackEntry.emitRows(row, runtime)[0],
  );
  const quarantined = [];
  for await (const emission of runtime.iterateRows(periodSource, [missingPeriod])) {
    quarantined.push(emission);
  }
  assert.equal(quarantined[0].sourceTable, periodSource);
  assert.equal(quarantined[0].identityRef, `${periodSource}:404`);
  assert.equal(quarantined[0].reasonCode, "MKT_EDITION_FEEDBACK_EDITION_NOT_FOUND");
  assert.deepEqual(
    [periodDecision, ...feedbackDecisions].map(({ status, field, reasonCode }) => ({
      status,
      field,
      reasonCode,
    })),
    [
      {
        status: "quarantine",
        field: "edicao",
        reasonCode: "MKT_EDITION_FEEDBACK_EDITION_NOT_FOUND",
      },
      {
        status: "quarantine",
        field: "edicao_id",
        reasonCode: "MKT_EDITION_FEEDBACK_EDITION_AMBIGUOUS",
      },
      {
        status: "quarantine",
        field: "edicao_id",
        reasonCode: "MKT_EDITION_FEEDBACK_EDITION_AMBIGUOUS",
      },
    ],
  );

  const uniqueRuntime = buildRemainingRuntimeState({
    sourceRows: {
      "tb_mkt.eventos": [eventRow],
      "tb_mkt.eventos_edicoes": [editionRow],
      [feedbackSource]: [validEvaluation, duplicateEvaluation],
    },
  });
  const duplicateDecisions = [validEvaluation, duplicateEvaluation].map((row) =>
    feedbackEntry.emitRows(row, uniqueRuntime)[0],
  );
  assert.ok(
    duplicateDecisions.every(
      ({ status, reasonCode }) =>
        status === "quarantine" && reasonCode === "MKT_EDITION_FEEDBACK_EVALUATION_AMBIGUOUS",
    ),
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { planMarketingEventEditionImport } from "../rules/marketing-event-editions.mjs";
import * as editionImports from "../rules/marketing-event-editions.mjs";

function planMarketingEventEditionFeedbackImport(input) {
  assert.equal(
    typeof editionImports.planMarketingEventEditionFeedbackImport,
    "function",
    "feedback importer is not implemented",
  );
  return editionImports.planMarketingEventEditionFeedbackImport(input);
}
const editionRow = {
  id: 19,
  evento_id: 7,
  nome: "Edição anual",
  orcamentos: [
    { id: "budget-a1", nome: "Espaço", valor: "1250.50" },
    { id: "budget-a2", nome: "Som", valor: "348.00" },
  ],
  data_local: "2026-11-12 | Castelo Branco",
  parcerias: [{ id: "partner-1", nome: "Parceiro" }],
  organizacao: [{ id: "team-1", nome: "Coordenação" }],
  logistica: { fornecedores: [{ id: "vendor-1", nome: "Buffet" }] },
  mkt_comunicacao: { divulgacao: [{ id: "post-1", nome: "Rede social" }] },
  durante_evento: { programacao: [{ id: "schedule-1", nome: "Palestra" }] },
  pos_evento: { agradecimento: [{ id: "thanks-1", nome: "Enviar agradecimento" }] },
  obs: "Confirmar horário",
};

test("imports an edition and relational budget only through one prepared legacy event", () => {
  const result = planMarketingEventEditionImport({
    editionRow,
    eventCandidates: [{ legacyId: 7, id: "event-7", status: "prepared" }],
  });

  assert.equal(result.status, "prepared");
  const { id, organization_id: editionOrganizationId, ...edition } = result.edition;
  assert.match(id, /^[0-9a-f-]{36}$/u);
  assert.equal(editionOrganizationId, "e8048d1c-0830-45d7-84de-68e20abd685b");
  assert.deepEqual(edition, {
    legacy_id: 19,
    event_id: "event-7",
    name: "Edição anual",
    date: "2026-11-12",
    place: "Castelo Branco",
    partnerships: ["Parceiro"],
    organizing_team: ["Coordenação"],
    logistics: {
      fornecedores: ["Buffet"],
      cronograma: [],
      registro: [],
      transporte: [],
      acomodacoes: [],
    },
    marketing_communication: { abertura: [], divulgacao: ["Rede social"], acessoria: [], site: [] },
    during_event: { recepcao: [], staff: [], programacao: ["Palestra"], feedback: [] },
    after_event: {
      avaliacao: [],
      agradecimento: ["Enviar agradecimento"],
      relatorio: [],
      followup: [],
    },
    notes: "Confirmar horário",
  });
  assert.deepEqual(
    result.budgetItems.map(({ legacy_id, name, amount, position }) => ({
      legacy_id,
      name,
      amount,
      position,
    })),
    [
      { legacy_id: "budget-a1", name: "Espaço", amount: "1250.50", position: 0 },
      { legacy_id: "budget-a2", name: "Som", amount: "348.00", position: 1 },
    ],
  );
  assert.ok(
    result.budgetItems.every(
      ({ id, edition_id, organization_id }) =>
        /^[0-9a-f-]{36}$/u.test(id) &&
        edition_id === result.edition.id &&
        organization_id === result.edition.organization_id,
    ),
  );
});

test("quarantines ambiguous, missing, or unprepared event links for reconciliation", () => {
  const ambiguous = planMarketingEventEditionImport({
    editionRow,
    eventCandidates: [
      { legacyId: 7, id: "event-7a", status: "prepared" },
      { legacyId: 7, id: "event-7b", status: "prepared" },
    ],
  });
  assert.deepEqual(
    { status: ambiguous.status, field: ambiguous.field, reasonCode: ambiguous.reasonCode },
    { status: "quarantine", field: "evento_id", reasonCode: "MKT_EDITION_EVENT_AMBIGUOUS" },
  );

  const missing = planMarketingEventEditionImport({ editionRow, eventCandidates: [] });
  assert.equal(missing.reasonCode, "MKT_EDITION_EVENT_NOT_FOUND");

  const parentQuarantined = planMarketingEventEditionImport({
    editionRow,
    eventCandidates: [{ legacyId: 7, id: "event-7", status: "quarantine" }],
  });
  assert.equal(parentQuarantined.reasonCode, "MKT_EDITION_EVENT_TARGET_QUARANTINED");
});

test("quarantines free-text date and place when they cannot be split without guessing", () => {
  const result = planMarketingEventEditionImport({
    editionRow: { ...editionRow, data_local: "12/11/2026 às 19h no Castelo Branco" },
    eventCandidates: [{ legacyId: 7, id: "event-7", status: "prepared" }],
  });

  assert.deepEqual(
    { status: result.status, field: result.field, reasonCode: result.reasonCode },
    { status: "quarantine", field: "data_local", reasonCode: "MKT_EDITION_DATE_LOCAL_AMBIGUOUS" },
  );
});

test("projects feedback period only to its exact edition", () => {
  const result = planMarketingEventEditionFeedbackImport({
    sourceTable: "tb_mkt.eventos_feedbacks_periodos",
    feedbackRow: {
      edicao: 19,
      inicio: "2026-10-01T09:00:00.000Z",
      fim: "2026-10-30T18:00:00.000Z",
    },
    editionCandidates: [{ legacyId: 19, id: "edition-19", status: "prepared" }],
  });

  assert.deepEqual(result, {
    status: "prepared",
    kind: "period",
    editionId: "edition-19",
    organizationId: "e8048d1c-0830-45d7-84de-68e20abd685b",
    feedbackPeriodStart: "2026-10-01T09:00:00.000Z",
    feedbackPeriodEnd: "2026-10-30T18:00:00.000Z",
  });
});

test("projects evaluation rating, observation, timestamp, and stable identity to its edition", () => {
  const input = {
    sourceTable: "tb_mkt.eventos_feedbacks",
    feedbackRow: {
      id: 81,
      edicao_id: 19,
      data: "2026-11-01T12:30:00.000Z",
      user_id: 44,
      nota: 5,
      obs: "Ótima organização",
      valido: 1,
    },
    editionCandidates: [{ legacyId: 19, id: "edition-19", status: "prepared" }],
  };
  const result = planMarketingEventEditionFeedbackImport(input);
  const replay = planMarketingEventEditionFeedbackImport(input);

  assert.equal(result.status, "prepared");
  assert.equal(result.kind, "evaluation");
  assert.equal(result.evaluation.edition_id, "edition-19");
  assert.equal(result.evaluation.rating, 5);
  assert.equal(result.evaluation.observation, "Ótima organização");
  assert.equal(result.evaluation.evaluated_at, "2026-11-01T12:30:00.000Z");
  assert.match(result.evaluation.id, /^[0-9a-f-]{36}$/u);
  assert.equal(replay.evaluation.id, result.evaluation.id);
});

test("quarantines feedback rows with no edition match", () => {
  const result = planMarketingEventEditionFeedbackImport({
    sourceTable: "tb_mkt.eventos_feedbacks",
    feedbackRow: { id: 81, edicao_id: 404, data: "2026-11-01T12:30:00.000Z", nota: 4, obs: "" },
    editionCandidates: [],
  });

  assert.deepEqual(
    { status: result.status, field: result.field, reasonCode: result.reasonCode },
    {
      status: "quarantine",
      field: "edicao_id",
      reasonCode: "MKT_EDITION_FEEDBACK_EDITION_NOT_FOUND",
    },
  );
});

test("quarantines feedback rows with ambiguous edition matches", () => {
  const result = planMarketingEventEditionFeedbackImport({
    sourceTable: "tb_mkt.eventos_feedbacks_periodos",
    feedbackRow: { edicao: 19, inicio: "2026-10-01T09:00:00.000Z", fim: "2026-10-30T18:00:00.000Z" },
    editionCandidates: [
      { legacyId: 19, id: "edition-19a", status: "prepared" },
      { legacyId: 19, id: "edition-19b", status: "prepared" },
    ],
  });

  assert.deepEqual(
    { status: result.status, field: result.field, reasonCode: result.reasonCode },
    {
      status: "quarantine",
      field: "edicao",
      reasonCode: "MKT_EDITION_FEEDBACK_EDITION_AMBIGUOUS",
    },
  );
});

test("quarantines multiple legacy evaluations for one edition without selecting a winner", () => {
  const feedbackRow = {
    id: 81,
    edicao_id: 19,
    data: "2026-11-01 12:30:00",
    nota: 5,
    obs: "Ótima organização",
    valido: 1,
  };
  const result = editionImports.planMarketingEventEditionFeedbackImport({
    sourceTable: "tb_mkt.eventos_feedbacks",
    feedbackRow,
    evaluationRows: [feedbackRow, { ...feedbackRow, id: 82, nota: 4 }],
    editionCandidates: [{ legacyId: 19, id: "edition-19", status: "prepared" }],
  });

  assert.deepEqual(
    { status: result.status, field: result.field, reasonCode: result.reasonCode },
    {
      status: "quarantine",
      field: "edicao_id",
      reasonCode: "MKT_EDITION_FEEDBACK_EVALUATION_AMBIGUOUS",
    },
  );
});

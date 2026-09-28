import assert from "node:assert/strict";
import test from "node:test";

import { planMarketingEventEditionImport } from "../rules/marketing-event-editions.mjs";

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

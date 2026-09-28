import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";

const SOURCE_TABLE = "tb_mkt.eventos_edicoes";
const PLANNING_KEYS = Object.freeze({
  logistics: ["fornecedores", "cronograma", "registro", "transporte", "acomodacoes"],
  marketing_communication: ["abertura", "divulgacao", "acessoria", "site"],
  during_event: ["recepcao", "staff", "programacao", "feedback"],
  after_event: ["avaliacao", "agradecimento", "relatorio", "followup"],
});

export function planMarketingEventEditionImport({ editionRow, eventCandidates }) {
  const eventLink = resolveEventLink(editionRow?.evento_id, eventCandidates);
  if (eventLink.status !== "prepared") return eventLink;

  if (!positiveInteger(editionRow?.id)) return quarantine("id", "MKT_EDITION_ID_INVALID");
  const name = requiredText(editionRow?.nome, 100);
  if (name === null) return quarantine("nome", "MKT_EDITION_NAME_INVALID");

  const datePlace = splitDatePlace(editionRow?.data_local);
  if (datePlace === null) return quarantine("data_local", "MKT_EDITION_DATE_LOCAL_AMBIGUOUS");

  const partnerships = parseLegacyNames(editionRow?.parcerias, "parcerias");
  if (partnerships === null) return quarantine("parcerias", "MKT_EDITION_PARTNERSHIPS_INVALID");
  const organizingTeam = parseLegacyNames(editionRow?.organizacao, "organizacao");
  if (organizingTeam === null) return quarantine("organizacao", "MKT_EDITION_TEAM_INVALID");

  const logistics = parsePlanningSection(editionRow?.logistica, PLANNING_KEYS.logistics);
  if (logistics === null) return quarantine("logistica", "MKT_EDITION_LOGISTICS_INVALID");
  const marketingCommunication = parsePlanningSection(
    editionRow?.mkt_comunicacao,
    PLANNING_KEYS.marketing_communication,
  );
  if (marketingCommunication === null) {
    return quarantine("mkt_comunicacao", "MKT_EDITION_MARKETING_INVALID");
  }
  const duringEvent = parsePlanningSection(editionRow?.durante_evento, PLANNING_KEYS.during_event);
  if (duringEvent === null) return quarantine("durante_evento", "MKT_EDITION_DURING_INVALID");
  const afterEvent = parsePlanningSection(editionRow?.pos_evento, PLANNING_KEYS.after_event);
  if (afterEvent === null) return quarantine("pos_evento", "MKT_EDITION_AFTER_INVALID");

  const editionId = generatedId(`${SOURCE_TABLE}:${editionRow.id}`);
  const budgetItems = parseBudgetItems(editionRow?.orcamentos, editionId);
  if (budgetItems === null) return quarantine("orcamentos", "MKT_EDITION_BUDGET_INVALID");

  const notes = editionRow?.obs ?? "";
  if (typeof notes !== "string") return quarantine("obs", "MKT_EDITION_NOTES_INVALID");

  return Object.freeze({
    status: "prepared",
    edition: Object.freeze({
      id: editionId,
      legacy_id: Number(editionRow.id),
      organization_id: CASTELO_ORGANIZATION_ID,
      event_id: eventLink.id,
      name,
      date: datePlace.date,
      place: datePlace.place,
      partnerships,
      organizing_team: organizingTeam,
      logistics,
      marketing_communication: marketingCommunication,
      during_event: duringEvent,
      after_event: afterEvent,
      notes,
    }),
    budgetItems,
  });
}

function resolveEventLink(legacyId, candidates) {
  if (!positiveInteger(legacyId)) return quarantine("evento_id", "MKT_EDITION_EVENT_LINK_INVALID");
  if (!Array.isArray(candidates))
    return quarantine("evento_id", "MKT_EDITION_EVENT_LOOKUP_MISSING");
  const matches = candidates.filter((event) => String(event?.legacyId) === String(legacyId));
  if (matches.length === 0) return quarantine("evento_id", "MKT_EDITION_EVENT_NOT_FOUND");
  if (matches.length > 1) return quarantine("evento_id", "MKT_EDITION_EVENT_AMBIGUOUS");
  if (matches[0].status !== "prepared" || typeof matches[0].id !== "string") {
    return quarantine("evento_id", "MKT_EDITION_EVENT_TARGET_QUARANTINED");
  }
  return { status: "prepared", id: matches[0].id };
}

function splitDatePlace(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+(?:\||-)\s+(.+)$/u);
  if (!match) return null;
  const [, rawDate, rawPlace] = match;
  const date = rawDate.includes("/")
    ? `${rawDate.slice(6, 10)}-${rawDate.slice(3, 5)}-${rawDate.slice(0, 2)}`
    : rawDate;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const place = requiredText(rawPlace, 255);
  return place === null ? null : { date, place };
}

function parseLegacyNames(value, field) {
  const parsed = parseJsonValue(value, field);
  if (parsed === null || (isPlainObject(parsed) && Object.keys(parsed).length === 0)) return [];
  if (!Array.isArray(parsed)) return null;
  const names = [];
  for (const item of parsed) {
    const name = isPlainObject(item) ? requiredText(item.nome, 200) : null;
    if (name === null) return null;
    names.push(name);
  }
  return Object.freeze(names);
}

function parsePlanningSection(value, keys) {
  const parsed = parseJsonValue(value, "planning");
  if (parsed === null || !isPlainObject(parsed)) return null;
  if (Object.keys(parsed).some((key) => !keys.includes(key))) return null;
  const section = {};
  for (const key of keys) {
    const values = parseLegacyNames(parsed[key], key);
    if (values === null) return null;
    section[key] = values;
  }
  return Object.freeze(section);
}

function parseBudgetItems(value, editionId) {
  const parsed = parseJsonValue(value, "orcamentos");
  if (parsed === null || (isPlainObject(parsed) && Object.keys(parsed).length === 0)) return [];
  if (!Array.isArray(parsed)) return null;
  const ids = new Set();
  const items = [];
  for (const [position, item] of parsed.entries()) {
    if (!isPlainObject(item)) return null;
    const legacyId = legacyToken(item.id);
    const name = requiredText(item.nome, 100);
    const amount = decimalAmount(item.valor);
    if (legacyId === null || ids.has(legacyId) || name === null || amount === null) return null;
    ids.add(legacyId);
    items.push(
      Object.freeze({
        id: generatedId(`${SOURCE_TABLE}:${editionId}:budget:${legacyId}`),
        organization_id: CASTELO_ORGANIZATION_ID,
        edition_id: editionId,
        legacy_id: legacyId,
        name,
        amount,
        position,
      }),
    );
  }
  return Object.freeze(items);
}

function decimalAmount(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  const match = normalized.match(/^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/u);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}

function parseJsonValue(value, _field) {
  if (value == null || value === "") return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function requiredText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function legacyToken(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const token = String(value).trim();
  return /^[A-Za-z0-9_-]{1,100}$/u.test(token) ? token : null;
}

function generatedId(identityRef) {
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, identityRef);
}

function quarantine(field, reasonCode) {
  return Object.freeze({ status: "quarantine", field, reasonCode });
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

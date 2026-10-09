import { isAxiosError } from "axios";

import type {
  ContabilControlFilters,
  ContabilCompetence,
  TriageDocumentItemNotes,
  TriageDocumentStatus,
  TriageRoutineType,
} from "../types";

export const CONTABIL_ENDPOINTS = {
  noah: "/contabil/noah",
  noahCsv: (id: string) => `/contabil/noah/${id}/csv`,
  controls: "/contabil/controls",
  controlsList: "/contabil/controls/list",
  controlById: (controlId: string) => `/contabil/controls/${controlId}`,
  controlItems: (controlId: string) => `/contabil/controls/${controlId}/items`,
  controlsYear: "/contabil/controls/year",
  controlsRestore: "/contabil/controls/restore",
  responsibles: "/contabil/responsibles",
  responsibleById: (responsibleId: string) => `/contabil/responsibles/${responsibleId}`,
  responsibleByClient: (clientId: string) => `/contabil/responsibles/client/${clientId}`,
  relationships: "/contabil/relationships",
  relationshipById: (relationshipId: string) => `/contabil/relationships/${relationshipId}`,
  relationshipByClient: (clientId: string) => `/contabil/relationships/client/${clientId}`,
  triageMonthly: "/triagem/monthly",
  triageEditability: "/triagem/editability",
  triageMonthlyItem: (monthlyId: string) => `/triagem/monthly/${monthlyId}/item`,
  triageMonthlyItems: (monthlyId: string) => `/triagem/monthly/${monthlyId}/items`,
  triageStatements: "/triagem/statements",
  triageClosing: "/triagem/closing",
} as const;

// Método de entrega e site estadual só existem na rotina fiscal; o backend
// recusa essas chaves (mesmo nulas) na rotina contábil.
export function buildTriageItemPayload(
  field: string,
  status: TriageDocumentStatus | undefined,
  itemNotes: Partial<TriageDocumentItemNotes> | undefined,
  type: TriageRoutineType,
  value?: string | null,
) {
  const { delivery_method, state_site, ...notes } = itemNotes ?? {};
  return {
    field,
    ...(status ? { status } : {}),
    ...(type === "FISCAL" ? { type } : {}),
    ...(value !== undefined ? { value } : {}),
    ...notes,
    ...(type === "FISCAL" && delivery_method !== undefined ? { delivery_method } : {}),
    ...(type === "FISCAL" && state_site !== undefined ? { state_site } : {}),
  };
}

export function buildContabilControlParams(filters: ContabilControlFilters) {
  return {
    client_id: filters.clientId,
    competence: filters.competence,
  };
}

export function buildContabilPortfolioParams(competence: ContabilCompetence) {
  return { competence };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapContabilEnvelope<T>(body: unknown): T {
  if (isRecord(body) && "data" in body) {
    return body.data as T;
  }

  return body as T;
}

export function isNotFoundError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

export async function executeNullableContabilRequest<T>(
  request: () => Promise<{ data: unknown }>,
): Promise<T | null> {
  try {
    const response = await request();
    return response.data === null ? null : unwrapContabilEnvelope<T>(response.data);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export function normalizeContabilCompetence(competence: string): ContabilCompetence {
  return competence as ContabilCompetence;
}

import type { ClientListFilters } from "../types";

export const CLIENT_ENDPOINTS = {
  list: "/client/list",
  instagramProfilesReport: "/client/instagram-profiles/report",
  create: "/client",
  createIntegration: "/client/integration",
  lookupCnpj: "/client/integration",
  detail: (id: string) => `/client/${id}`,
  updateIntegration: (id: string) => `/client/${id}/integration`,
  updateFinance: (id: string) => `/client/${id}/finance`,
  updateRegularize: (id: string) => `/client/${id}/regularize`,
  terminate: (id: string) => `/client/${id}/termination`,
  activate: (id: string) => `/client/${id}/activate`,
  detailPa: (id: string) => `/client/${id}/pa`,
  createPa: (id: string) => `/client/${id}/pa`,
  updatePa: (id: string) => `/client/${id}/pa`,
  histories: (id: string) => `/client/${id}/histories`,
  updateHistory: (id: string, historyId: string) => `/client/${id}/histories/${historyId}`,
  deleteHistory: (id: string, historyId: string) => `/client/${id}/histories/${historyId}`,
  createHistoryPending: (id: string) => `/client/${id}/histories/pending`,
  listHistoryPending: "/client/histories/pending",
  deleteHistoryPending: (pendingId: string) => `/client/histories/pending/${pendingId}`,
} as const;

const LEGACY_CLIENT_STATUS_FILTERS = new Set(["Ativo", "Inativo"]);

export function buildClientListParams(filters: ClientListFilters) {
  const shouldUseLegacyIntegrationStatusFilter =
    filters.legacyIntegrationStatusFilter !== false;
  const ref =
    filters.ref ??
    (shouldUseLegacyIntegrationStatusFilter &&
    filters.status &&
    LEGACY_CLIENT_STATUS_FILTERS.has(filters.status)
      ? "integracao"
      : undefined);

  return Object.fromEntries(
    Object.entries({
      search: filters.search,
      ref,
      status: filters.status,
      page: filters.page,
      limit: filters.limit,
    }).filter(([, value]) => value !== undefined),
  );
}

export function unwrapClientEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export function unwrapClientPaDetail(body: unknown) {
  const data = unwrapClientEnvelope<{ detail?: unknown } | unknown>(body);

  if (data !== null && typeof data === "object" && "detail" in data) {
    return (data as { detail: unknown }).detail;
  }

  return data;
}

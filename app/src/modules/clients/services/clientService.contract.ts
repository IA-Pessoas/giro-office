import type { ClientListFilters } from "../types";

export const CLIENT_ENDPOINTS = {
  list: "/client/list",
  create: "/client",
  detail: (id: string) => `/client/${id}`,
  activate: (id: string) => `/client/${id}/activate`,
  detailPa: (id: string) => `/client/${id}/pa`,
  createPa: (id: string) => `/client/${id}/pa`,
  updatePa: (id: string) => `/client/${id}/pa`,
} as const;

export function buildClientListParams(filters: ClientListFilters) {
  return {
    search: filters.search,
    status: filters.status,
    page: filters.page,
    limit: filters.limit,
  };
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

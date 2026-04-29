import type { ClientListFilters } from "../types";

export const CLIENT_ENDPOINTS = {
  list: "/client/list",
  create: "/client",
  detail: (id: string) => `/client/${id}`,
  activate: (id: string) => `/client/${id}/activate`,
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

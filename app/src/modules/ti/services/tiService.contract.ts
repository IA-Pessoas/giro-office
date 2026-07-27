import type { TiEnvelope, TiId, TiListFilters, TiListResponse } from "../types";

export const TI_ENDPOINTS = {
  dashboard: "/ti/dashboard",
  inventory: {
    list: "/ti/inventory/list",
    base: "/ti/inventory",
    detail: "/ti/inventory/{id}",
    assignUser: "/ti/inventory/{id}/assign-user",
    returnAsset: "/ti/inventory/{id}/return",
  },
  inventoryCategories: {
    list: "/ti/inventory-categories/list",
    base: "/ti/inventory-categories",
    detail: "/ti/inventory-categories/{id}",
  },
  inventoryLocations: {
    list: "/ti/inventory-locations/list",
    base: "/ti/inventory-locations",
    detail: "/ti/inventory-locations/{id}",
  },
  requests: {
    list: "/ti/requests/list",
    base: "/ti/requests",
    detail: "/ti/requests/{id}",
    assign: "/ti/requests/{id}/assign",
    status: "/ti/requests/{id}/status",
    messages: "/ti/requests/{id}/messages",
  },
  requestCategories: {
    list: "/ti/request-categories/list",
    base: "/ti/request-categories",
    detail: "/ti/request-categories/{id}",
  },
  passwords: {
    list: "/ti/passwords/list",
    base: "/ti/passwords",
    detail: "/ti/passwords/{id}",
  },
  extensions: {
    list: "/ti/extensions/list",
    base: "/ti/extensions",
    detail: "/ti/extensions/{id}",
  },
  terms: {
    list: "/ti/terms/list",
    base: "/ti/terms",
    detail: "/ti/terms/{id}",
    sign: "/ti/terms/{id}/sign",
  },
  stockItems: {
    list: "/ti/stock/items/list",
    base: "/ti/stock/items",
    detail: "/ti/stock/items/{id}",
    entries: "/ti/stock/items/{id}/entries",
    exits: "/ti/stock/items/{id}/exits",
    movements: "/ti/stock/items/{id}/movements/list",
  },
  stockCategories: {
    list: "/ti/stock/categories/list",
    base: "/ti/stock/categories",
    detail: "/ti/stock/categories/{id}",
  },
  stockLocations: {
    list: "/ti/stock/locations/list",
    base: "/ti/stock/locations",
    detail: "/ti/stock/locations/{id}",
  },
  robots: {
    list: "/ti/robots/list",
    base: "/ti/robots",
    detail: "/ti/robots/{id}",
    runs: "/ti/robots/{id}/runs",
    runsList: "/ti/robots/{id}/runs/list",
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildTiPath(path: string, id: TiId): string {
  return path.replace("{id}", encodeURIComponent(String(id)));
}

export function buildTiListParams(filters: TiListFilters = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function unwrapTiEnvelope<TPayload>(body: TiEnvelope<TPayload>): TPayload {
  if (isRecord(body)) {
    if ("data" in body) {
      return body.data as TPayload;
    }

    if ("result" in body) {
      return body.result as TPayload;
    }

    if ("payload" in body) {
      return body.payload as TPayload;
    }
  }

  return body as TPayload;
}

export function unwrapTiList<TItem>(
  body: TiEnvelope<TItem[] | TiListResponse<TItem>>,
): TItem[] {
  return unwrapTiListResponse<TItem>(body).items;
}

export function unwrapTiListResponse<TItem>(
  body: TiEnvelope<TItem[] | TiListResponse<TItem>>,
): TiListResponse<TItem> {
  const payload = unwrapTiEnvelope<TItem[] | TiListResponse<TItem>>(body);

  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length };
  }

  if (isRecord(payload) && Array.isArray(payload.items)) {
    return {
      ...payload,
      items: payload.items as TItem[],
      total: typeof payload.total === "number" ? payload.total : payload.items.length,
    };
  }

  return { items: [], total: 0 };
}

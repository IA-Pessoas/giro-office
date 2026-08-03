import type { TiId, TiListFilters } from "../types";

export const tiQueryKeys = {
  all: ["ti"] as const,
  dashboard: () => [...tiQueryKeys.all, "dashboard"] as const,
  requests: {
    all: () => [...tiQueryKeys.all, "requests"] as const,
    list: (filters?: TiListFilters) => [...tiQueryKeys.requests.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.requests.all(), "detail", id] as const,
    transferCandidates: (id?: TiId) =>
      [...tiQueryKeys.requests.detail(id), "transfer-candidates"] as const,
    messages: (id?: TiId) => [...tiQueryKeys.requests.detail(id), "messages"] as const,
    categories: (filters?: TiListFilters) =>
      [...tiQueryKeys.requests.all(), "categories", filters ?? {}] as const,
  },
  robots: {
    all: () => [...tiQueryKeys.all, "robots"] as const,
    list: (filters?: TiListFilters) => [...tiQueryKeys.robots.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.robots.all(), "detail", id] as const,
    runs: (id?: TiId, filters?: TiListFilters) =>
      [...tiQueryKeys.robots.detail(id), "runs", filters ?? {}] as const,
  },
  inventory: {
    all: () => [...tiQueryKeys.all, "inventory"] as const,
    list: (filters?: TiListFilters) =>
      [...tiQueryKeys.inventory.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.inventory.all(), "detail", id] as const,
    categories: (filters?: TiListFilters) =>
      [...tiQueryKeys.inventory.all(), "categories", filters ?? {}] as const,
    locations: (filters?: TiListFilters) =>
      [...tiQueryKeys.inventory.all(), "locations", filters ?? {}] as const,
  },
  terms: {
    all: () => [...tiQueryKeys.all, "terms"] as const,
    list: (filters?: TiListFilters) => [...tiQueryKeys.terms.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.terms.all(), "detail", id] as const,
  },
  stock: {
    all: () => [...tiQueryKeys.all, "stock"] as const,
    items: (filters?: TiListFilters) => [...tiQueryKeys.stock.all(), "items", filters ?? {}] as const,
    item: (id?: TiId) => [...tiQueryKeys.stock.all(), "item", id] as const,
    movements: (id?: TiId) => [...tiQueryKeys.stock.item(id), "movements"] as const,
    categories: (filters?: TiListFilters) =>
      [...tiQueryKeys.stock.all(), "categories", filters ?? {}] as const,
    locations: (filters?: TiListFilters) =>
      [...tiQueryKeys.stock.all(), "locations", filters ?? {}] as const,
  },
  passwords: {
    all: () => [...tiQueryKeys.all, "passwords"] as const,
    list: (filters?: TiListFilters) =>
      [...tiQueryKeys.passwords.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.passwords.all(), "detail", id] as const,
  },
  extensions: {
    all: () => [...tiQueryKeys.all, "extensions"] as const,
    list: (filters?: TiListFilters) =>
      [...tiQueryKeys.extensions.all(), "list", filters ?? {}] as const,
    detail: (id?: TiId) => [...tiQueryKeys.extensions.all(), "detail", id] as const,
  },
} as const;

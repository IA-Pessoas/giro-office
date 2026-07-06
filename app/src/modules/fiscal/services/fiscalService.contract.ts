import type {
  FiscalIcmsListFilters,
  FiscalIpiListFilters,
  FiscalNcmListFilters,
  FiscalNcmSearchFilters,
} from "../types";

export const FISCAL_ENDPOINTS = {
  ncm: "/fiscal/ncm",
  ncmList: "/fiscal/ncm/list",
  icms: "/fiscal/icms",
  icmsList: "/fiscal/icms/list",
  ipi: "/fiscal/ipi",
  ipiList: "/fiscal/ipi/list",
  ncmSearch: "/fiscal/ncm-search",
} as const;

export function buildFiscalNcmListParams(filters: FiscalNcmListFilters = {}) {
  return {
    ncmCodes: filters.ncmCodes?.length ? filters.ncmCodes.join(",") : undefined,
  };
}

export function buildFiscalIcmsListParams(filters: FiscalIcmsListFilters = {}) {
  return {
    icmsCodes: filters.icmsCodes?.length ? filters.icmsCodes.join(",") : undefined,
  };
}

export function buildFiscalIpiListParams(filters: FiscalIpiListFilters = {}) {
  return {
    ipiCodes: filters.ipiCodes?.length ? filters.ipiCodes.join(",") : undefined,
  };
}

export function buildFiscalNcmSearchParams(filters: FiscalNcmSearchFilters = {}) {
  return {
    ncmCode: filters.ncmCode,
  };
}

export function buildFiscalNcmDetailParams(ncmId: string) {
  return {
    ncm_id: ncmId,
  };
}

export function buildFiscalIcmsDetailParams(icmsId: string) {
  return {
    icms_id: icmsId,
  };
}

export function buildFiscalIpiDetailParams(ipiId: string) {
  return {
    ipi_id: ipiId,
  };
}

export function unwrapFiscalEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

// `unwrapFiscalDetail` and `unwrapFiscalCreate` handle backend responses nested in `detail` and `create`.
export function unwrapFiscalDetail<T>(body: unknown): T {
  const data = unwrapFiscalEnvelope<T | { detail: T }>(body);

  if (data !== null && typeof data === "object" && "detail" in data) {
    return (data as { detail: T }).detail;
  }

  return data as T;
}

export function unwrapFiscalCreate<T>(body: unknown): T {
  const data = unwrapFiscalEnvelope<T | { create: T }>(body);

  if (data !== null && typeof data === "object" && "create" in data) {
    return (data as { create: T }).create;
  }

  return data as T;
}

// Covers updates and direct responses, including endpoints that already return arrays without extra nesting.
export function unwrapFiscalMutation<T>(body: unknown): T {
  const data = unwrapFiscalEnvelope<T | { detail: T } | { create: T }>(body);

  if (Array.isArray(data)) {
    return data as T;
  }

  if (data !== null && typeof data === "object" && "detail" in data) {
    return (data as { detail: T }).detail;
  }

  if (data !== null && typeof data === "object" && "create" in data) {
    return (data as { create: T }).create;
  }

  return data as T;
}

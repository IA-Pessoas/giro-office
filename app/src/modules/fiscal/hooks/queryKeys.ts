import type {
  FiscalIcmsListFilters,
  FiscalIpiListFilters,
  FiscalNcmListFilters,
} from "../types";

export const FISCAL_QUERY_KEY = ["fiscal"] as const;
export const FISCAL_LIST_PAGE_SIZE = 20;

export function fiscalNcmSearchQueryKey(ncmCode: string) {
  return [...FISCAL_QUERY_KEY, "search", ncmCode] as const;
}

export function fiscalNcmListQueryKey(filters: FiscalNcmListFilters) {
  return [
    ...FISCAL_QUERY_KEY,
    "ncm",
    "list",
    [...(filters.ncmCodes ?? [])],
    filters.page ?? 1,
    filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  ] as const;
}

export function fiscalNcmDetailQueryKey(ncmId?: string | null) {
  return [...FISCAL_QUERY_KEY, "ncm", "detail", ncmId ?? ""] as const;
}

export function fiscalIcmsListQueryKey(filters: FiscalIcmsListFilters) {
  return [
    ...FISCAL_QUERY_KEY,
    "icms",
    "list",
    [...(filters.icmsCodes ?? [])],
    filters.page ?? 1,
    filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  ] as const;
}

export function fiscalIcmsDetailQueryKey(icmsId?: string | null) {
  return [...FISCAL_QUERY_KEY, "icms", "detail", icmsId ?? ""] as const;
}

export function fiscalIpiListQueryKey(filters: FiscalIpiListFilters) {
  return [
    ...FISCAL_QUERY_KEY,
    "ipi",
    "list",
    [...(filters.ipiCodes ?? [])],
    filters.page ?? 1,
    filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  ] as const;
}

export function fiscalIpiDetailQueryKey(ipiId?: string | null) {
  return [...FISCAL_QUERY_KEY, "ipi", "detail", ipiId ?? ""] as const;
}

export const FISCAL_QUERY_KEY = ["fiscal"] as const;

export function fiscalNcmSearchQueryKey(ncmCode: string) {
  return [...FISCAL_QUERY_KEY, "search", ncmCode] as const;
}

export function fiscalNcmListQueryKey(ncmCodes: string[]) {
  return [...FISCAL_QUERY_KEY, "ncm", "list", ncmCodes.join("|")] as const;
}

export function fiscalNcmDetailQueryKey(ncmId?: string | null) {
  return [...FISCAL_QUERY_KEY, "ncm", "detail", ncmId ?? ""] as const;
}

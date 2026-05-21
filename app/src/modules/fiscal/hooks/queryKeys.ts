export const FISCAL_QUERY_KEY = ["fiscal"] as const;

export function fiscalNcmSearchQueryKey(ncmCode: string) {
  return [...FISCAL_QUERY_KEY, "search", ncmCode] as const;
}

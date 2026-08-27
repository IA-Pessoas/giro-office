export const REPORTS_QUERY_KEY = ["reports"] as const;

export function reportsCatalogQueryKey() {
  return [...REPORTS_QUERY_KEY, "catalog"] as const;
}

export function reportsPreviewQueryKey(sourceKey: string) {
  return [...REPORTS_QUERY_KEY, "preview", sourceKey] as const;
}

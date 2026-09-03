export const REPORTS_QUERY_KEY = ["reports"] as const;

export function reportsCatalogQueryKey() {
  return [...REPORTS_QUERY_KEY, "catalog"] as const;
}

export function reportsPreviewQueryKey(sourceKey: string) {
  return [...REPORTS_QUERY_KEY, "preview", sourceKey] as const;
}

export function reportsModelsQueryKey(scope: "personal" | "shared") {
  return [...REPORTS_QUERY_KEY, "models", scope] as const;
}

export function reportsHistoryQueryKey(params: {
  scope: "personal" | "library";
  status?: string;
  from?: string;
  to?: string;
  model_id?: string;
  author_id?: string;
  cursor?: number;
}) {
  return [
    ...REPORTS_QUERY_KEY,
    "history",
    params.scope,
    params.status ?? "all",
    params.from ?? "",
    params.to ?? "",
    params.model_id ?? "",
    params.author_id ?? "",
    params.cursor ?? null,
  ] as const;
}

export function reportsSnapshotQueryKey(
  id: string,
  scope: "personal" | "library",
  cursor?: number,
) {
  return [...REPORTS_QUERY_KEY, "snapshot", id, scope, cursor ?? null] as const;
}

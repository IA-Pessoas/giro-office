import { useFetch } from "@shared/hooks";

import {
  triagemOverviewService,
  type TriageOverviewFilters,
} from "../services/triagemOverviewService";

export function triagemOverviewQueryKey(filters: TriageOverviewFilters) {
  return [
    "triagem",
    "overview",
    filters.page,
    filters.pageSize,
    filters.clientId ?? "",
    filters.competence ?? "",
    filters.status ?? "",
  ] as const;
}

export function useTriageOverview(filters: TriageOverviewFilters) {
  return useFetch(
    triagemOverviewQueryKey(filters),
    () => triagemOverviewService.list(filters),
  );
}

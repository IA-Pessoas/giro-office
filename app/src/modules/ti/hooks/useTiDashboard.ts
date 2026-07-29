import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiDashboardService } from "../services";
import type { TiDashboardSummary, TiReadQueryOptions } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiDashboard(
  options?: TiReadQueryOptions,
): UseQueryResult<TiDashboardSummary, Error> {
  return useFetch(tiQueryKeys.dashboard(), () => tiDashboardService.getDashboard(), options);
}

import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { comercialService } from "../services/comercialService";
import type { CommercialDashboardStats } from "../types";
import { commercialQueryKeys } from "./queryKeys";

export function useCommercialDashboard(): UseQueryResult<CommercialDashboardStats, Error> {
  return useFetch(commercialQueryKeys.dashboard(), () => comercialService.getDashboardStats());
}

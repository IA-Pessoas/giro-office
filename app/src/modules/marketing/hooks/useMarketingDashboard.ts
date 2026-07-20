import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { marketingService } from "../services/marketingService";
import type { MarketingDashboardStats } from "../types";
import { marketingQueryKeys } from "./queryKeys";

export function useMarketingDashboard(): UseQueryResult<MarketingDashboardStats, Error> {
  return useFetch(marketingQueryKeys.dashboard(), () => marketingService.getDashboardStats());
}

import { useFetch } from "@shared/hooks";

import { marketingDashboardService } from "../services/marketingDashboardService";

export function useMarketingDashboard() {
  return useFetch(["marketing", "dashboard"], () => marketingDashboardService.getDashboard());
}

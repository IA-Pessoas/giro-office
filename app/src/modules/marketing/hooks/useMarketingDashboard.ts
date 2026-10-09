import { useAuth } from "@/context/AuthContext";
import { useFetch } from "@shared/hooks";

import { marketingDashboardService } from "../services/marketingDashboardService";
import { marketingQueryKey } from "../utils/marketingQueryKeys";

export function useMarketingDashboard(month?: string) {
  const { user } = useAuth();
  const queryKey = marketingQueryKey(
    month ? ["marketing", "dashboard", month] : ["marketing", "dashboard"],
    user,
  );
  return useFetch(queryKey, () => marketingDashboardService.getDashboard(month));
}

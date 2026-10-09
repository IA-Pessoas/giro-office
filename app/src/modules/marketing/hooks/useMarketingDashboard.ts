import { useAuth } from "@/context/AuthContext";
import { useFetch } from "@shared/hooks";

import { marketingDashboardService } from "../services/marketingDashboardService";
import { marketingQueryKey } from "../utils/marketingQueryKeys";

export function useMarketingDashboard() {
  const { user } = useAuth();
  const queryKey = marketingQueryKey(["marketing", "dashboard"], user);
  return useFetch(queryKey, () => marketingDashboardService.getDashboard());
}

export function useMarketingMonthlyBirthdays(month: number, enabled: boolean) {
  const { user } = useAuth();
  const queryKey = marketingQueryKey(["marketing", "birthdays", month], user);
  return useFetch(queryKey, () => marketingDashboardService.getMonthlyBirthdays(month), {
    enabled,
  });
}

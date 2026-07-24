import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";

import { dashboardService } from "../services/dashboardService";
import type { DashboardStats } from "../types";

interface UseDashboardResult {
  stats: DashboardStats | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useDashboard = (): UseDashboardResult => {
  const { user } = useAuth();
  const cacheScope = user?.organization_id ?? user?.id ?? "anonymous";
  const query = useQuery<DashboardStats, Error>({
    queryKey: ["dashboard", "stats", cacheScope],
    queryFn: () => dashboardService.getStats(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
    gcTime: Infinity,
  });
  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch,
  };
};

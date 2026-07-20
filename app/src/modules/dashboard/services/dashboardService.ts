import { setupAPIClient } from "@shared/services/api";
import type { DashboardStats } from "../types";

function unwrapDashboardStats(body: unknown): DashboardStats {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: DashboardStats }).data;
  }

  return body as DashboardStats;
}

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const api = setupAPIClient();
    const response = await api.get("/dashboard/stats");

    return unwrapDashboardStats(response.data);
  },
};

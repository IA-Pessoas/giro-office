import { setupAPIClient } from "@shared/services/api";

import type { CommercialDashboardStats } from "../types";

function unwrapCommercialDashboardStats(body: unknown): CommercialDashboardStats {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: CommercialDashboardStats }).data;
  }

  return body as CommercialDashboardStats;
}

export const comercialService = {
  async getDashboardStats(): Promise<CommercialDashboardStats> {
    const api = setupAPIClient();
    const response = await api.get("/dashboard/commercial/stats");

    return unwrapCommercialDashboardStats(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

import type { MarketingDashboardStats } from "../types";

function unwrapMarketingDashboardStats(body: unknown): MarketingDashboardStats {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: MarketingDashboardStats }).data;
  }

  return body as MarketingDashboardStats;
}

export const marketingService = {
  async getDashboardStats(): Promise<MarketingDashboardStats> {
    const api = setupAPIClient();
    const response = await api.get("/dashboard/marketing/stats");

    return unwrapMarketingDashboardStats(response.data);
  },
};

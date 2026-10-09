import { api } from "@shared/services/apiClient";

import type { MarketingDashboardSummary, MarketingEnvelope } from "../types/marketingDashboard";

export const marketingDashboardService = {
  async getDashboard(month?: string): Promise<MarketingDashboardSummary> {
    const response = await api.get<MarketingEnvelope<MarketingDashboardSummary>>(
      "/marketing/dashboard",
      month ? { params: { month } } : undefined,
    );

    if (!response.data.success || !response.data.data) {
      throw new Error("A resposta do dashboard de Marketing é inválida.");
    }

    return response.data.data;
  },
};

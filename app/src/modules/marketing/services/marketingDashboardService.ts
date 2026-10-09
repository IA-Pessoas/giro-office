import { api } from "@shared/services/apiClient";

import type {
  MarketingDashboardSummary,
  MarketingEnvelope,
  MarketingMonthlyBirthdays,
} from "../types/marketingDashboard";

export const marketingDashboardService = {
  async getDashboard(): Promise<MarketingDashboardSummary> {
    const response = await api.get<MarketingEnvelope<MarketingDashboardSummary>>(
      "/marketing/dashboard",
    );

    if (!response.data.success || !response.data.data) {
      throw new Error("A resposta do dashboard de Marketing é inválida.");
    }

    return response.data.data;
  },

  async getMonthlyBirthdays(month: number): Promise<MarketingMonthlyBirthdays> {
    const response = await api.get<MarketingEnvelope<MarketingMonthlyBirthdays>>(
      "/marketing/birthdays",
      { params: { month } },
    );

    if (!response.data.success || !response.data.data) {
      throw new Error("A resposta de aniversariantes de Marketing é inválida.");
    }

    return response.data.data;
  },
};

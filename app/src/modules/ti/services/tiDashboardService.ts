import { api } from "@shared/services/apiClient";

import type { TiDashboardSummary, TiEnvelope } from "../types";
import { TI_ENDPOINTS, unwrapTiEnvelope } from "./tiService.contract";

export const tiDashboardService = {
  async getDashboard(): Promise<TiDashboardSummary> {
    const response = await api.get<TiEnvelope<TiDashboardSummary>>(TI_ENDPOINTS.dashboard);

    return unwrapTiEnvelope<TiDashboardSummary>(response.data);
  },
};

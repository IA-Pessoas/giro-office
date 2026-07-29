import { setupAPIClient } from "@shared/services/api";

import type { CommercialOverview, CommercialSuccessEnvelope } from "../types";
import { COMMERCIAL_ENDPOINTS, unwrapCommercialEnvelope } from "./commercialService.contract";

export const commercialService = {
  async getOverview(): Promise<CommercialOverview> {
    const api = setupAPIClient();
    const response = await api.get<CommercialSuccessEnvelope<CommercialOverview>>(
      COMMERCIAL_ENDPOINTS.overview,
    );

    return unwrapCommercialEnvelope<CommercialOverview>(response.data);
  },
};

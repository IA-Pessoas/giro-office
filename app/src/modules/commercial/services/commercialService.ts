import { setupAPIClient } from "@shared/services/api";

import type {
  CommercialOverview,
  CommercialProposalConfig,
  CommercialSuccessEnvelope,
  CreateCommercialProposalConfigPayload,
  UpdateCommercialProposalConfigPayload,
} from "../types";
import { COMMERCIAL_ENDPOINTS, unwrapCommercialEnvelope } from "./commercialService.contract";

export const commercialService = {
  async getOverview(): Promise<CommercialOverview> {
    const api = setupAPIClient();
    const response = await api.get<CommercialSuccessEnvelope<CommercialOverview>>(
      COMMERCIAL_ENDPOINTS.overview,
    );

    return unwrapCommercialEnvelope<CommercialOverview>(response.data);
  },

  async listProposalConfigs(): Promise<CommercialProposalConfig[]> {
    const api = setupAPIClient();
    const response = await api.get<CommercialSuccessEnvelope<CommercialProposalConfig[]>>(
      COMMERCIAL_ENDPOINTS.proposalConfigs,
    );
    return unwrapCommercialEnvelope<CommercialProposalConfig[]>(response.data);
  },

  async createProposalConfig(
    payload: CreateCommercialProposalConfigPayload,
  ): Promise<CommercialProposalConfig> {
    const api = setupAPIClient();
    const response = await api.post<CommercialSuccessEnvelope<CommercialProposalConfig>>(
      COMMERCIAL_ENDPOINTS.proposalConfigs,
      payload,
    );
    return unwrapCommercialEnvelope<CommercialProposalConfig>(response.data);
  },

  async updateProposalConfig(
    id: string,
    payload: UpdateCommercialProposalConfigPayload,
  ): Promise<CommercialProposalConfig> {
    const api = setupAPIClient();
    const response = await api.patch<CommercialSuccessEnvelope<CommercialProposalConfig>>(
      COMMERCIAL_ENDPOINTS.proposalConfig(id),
      payload,
    );
    return unwrapCommercialEnvelope<CommercialProposalConfig>(response.data);
  },
};

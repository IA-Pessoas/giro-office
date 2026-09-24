import { setupAPIClient } from "@shared/services/api";

import type {
  CommercialProspecting,
  ArchiveCommercialProspectingResult,
  CommercialProposalConfig,
  DeleteCommercialProposalConfigResult,
  CommercialSuccessEnvelope,
  CommercialTaskBilling,
  CreateCommercialProposalConfigPayload,
  CreateCommercialProspectingPayload,
  UpdateCommercialProspectingPayload,
  UpdateCommercialProposalConfigPayload,
  UpdateCommercialTaskBillingPayload,
} from "../types";
import { COMMERCIAL_ENDPOINTS, unwrapCommercialEnvelope } from "./commercialService.contract";

export const commercialService = {
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

  async deleteProposalConfig(id: string): Promise<DeleteCommercialProposalConfigResult> {
    const api = setupAPIClient();
    const response = await api.delete<
      CommercialSuccessEnvelope<DeleteCommercialProposalConfigResult>
    >(COMMERCIAL_ENDPOINTS.proposalConfig(id));
    return unwrapCommercialEnvelope<DeleteCommercialProposalConfigResult>(response.data);
  },

  async listProspecting(): Promise<CommercialProspecting[]> {
    const api = setupAPIClient();
    const response = await api.get<CommercialSuccessEnvelope<CommercialProspecting[]>>(
      COMMERCIAL_ENDPOINTS.prospecting,
    );
    return unwrapCommercialEnvelope<CommercialProspecting[]>(response.data);
  },

  async createProspecting(
    payload: CreateCommercialProspectingPayload,
  ): Promise<CommercialProspecting> {
    const api = setupAPIClient();
    const response = await api.post<CommercialSuccessEnvelope<CommercialProspecting>>(
      COMMERCIAL_ENDPOINTS.prospecting,
      payload,
    );
    return unwrapCommercialEnvelope<CommercialProspecting>(response.data);
  },

  async updateProspecting(
    id: string,
    payload: UpdateCommercialProspectingPayload,
  ): Promise<CommercialProspecting> {
    const api = setupAPIClient();
    const response = await api.patch<CommercialSuccessEnvelope<CommercialProspecting>>(
      COMMERCIAL_ENDPOINTS.prospectingItem(id),
      payload,
    );
    return unwrapCommercialEnvelope<CommercialProspecting>(response.data);
  },

  async archiveProspecting(id: string): Promise<ArchiveCommercialProspectingResult> {
    const api = setupAPIClient();
    const response = await api.delete<
      CommercialSuccessEnvelope<ArchiveCommercialProspectingResult>
    >(COMMERCIAL_ENDPOINTS.prospectingItem(id));
    return unwrapCommercialEnvelope<ArchiveCommercialProspectingResult>(response.data);
  },

  async listTaskBillings(): Promise<CommercialTaskBilling[]> {
    const api = setupAPIClient();
    const response = await api.get<CommercialSuccessEnvelope<CommercialTaskBilling[]>>(
      COMMERCIAL_ENDPOINTS.taskBillings,
    );
    return unwrapCommercialEnvelope<CommercialTaskBilling[]>(response.data);
  },

  async updateTaskBilling(
    taskId: string,
    payload: UpdateCommercialTaskBillingPayload,
  ): Promise<CommercialTaskBilling> {
    const api = setupAPIClient();
    const response = await api.put<CommercialSuccessEnvelope<CommercialTaskBilling>>(
      COMMERCIAL_ENDPOINTS.taskBilling(taskId),
      payload,
    );
    return unwrapCommercialEnvelope<CommercialTaskBilling>(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilResponsible,
  CreateContabilResponsiblePayload,
  UpdateContabilResponsiblePayload,
} from "../types";
import {
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

export const contabilResponsibleService = {
  async getResponsibleByClient(clientId: string): Promise<ContabilResponsible | null> {
    const api = setupAPIClient();
    return executeNullableContabilRequest<ContabilResponsible>(() =>
      api.get(CONTABIL_ENDPOINTS.responsibleByClient(clientId)),
    );
  },

  async createResponsible(
    payload: CreateContabilResponsiblePayload,
  ): Promise<ContabilResponsible> {
    const api = setupAPIClient();
    const response = await api.post(CONTABIL_ENDPOINTS.responsibles, payload);

    return unwrapContabilEnvelope<ContabilResponsible>(response.data);
  },

  async updateResponsible(
    responsibleId: string,
    payload: UpdateContabilResponsiblePayload,
  ): Promise<ContabilResponsible> {
    const api = setupAPIClient();
    const response = await api.put(CONTABIL_ENDPOINTS.responsibleById(responsibleId), payload);

    return unwrapContabilEnvelope<ContabilResponsible>(response.data);
  },

  async deleteResponsible(responsibleId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CONTABIL_ENDPOINTS.responsibleById(responsibleId));
  },
};

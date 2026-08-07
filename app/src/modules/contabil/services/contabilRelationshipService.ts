import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilRelationship,
  CreateContabilRelationshipPayload,
  UpdateContabilRelationshipPayload,
} from "../types";
import {
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

export const contabilRelationshipService = {
  async getRelationshipByClient(clientId: string): Promise<ContabilRelationship | null> {
    const api = setupAPIClient();
    return executeNullableContabilRequest<ContabilRelationship>(() =>
      api.get(CONTABIL_ENDPOINTS.relationshipByClient(clientId)),
    );
  },

  async createRelationship(
    payload: CreateContabilRelationshipPayload,
  ): Promise<ContabilRelationship> {
    const api = setupAPIClient();
    const response = await api.post(CONTABIL_ENDPOINTS.relationships, payload);

    return unwrapContabilEnvelope<ContabilRelationship>(response.data);
  },

  async updateRelationship(
    relationshipId: string,
    payload: UpdateContabilRelationshipPayload,
  ): Promise<ContabilRelationship> {
    const api = setupAPIClient();
    const response = await api.put(CONTABIL_ENDPOINTS.relationshipById(relationshipId), payload);

    return unwrapContabilEnvelope<ContabilRelationship>(response.data);
  },

  async deleteRelationship(relationshipId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(CONTABIL_ENDPOINTS.relationshipById(relationshipId));
  },
};

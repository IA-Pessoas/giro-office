import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRhCategoryPayload,
  CreateRhMessagePayload,
  CreateRhRequestPayload,
  DeleteRhCategoryPayload,
  DeleteRhRequestPayload,
  RhCategory,
  RhCategoryListFilters,
  RhMessage,
  RhMessageListFilters,
  RhMutationMessage,
  RhRequest,
  RhRequestListFilters,
  UpdateRhCategoryPayload,
  UpdateRhRequestPayload,
} from "../types";
import {
  buildRhCategoryListParams,
  buildRhRequestListParams,
  RH_ENDPOINTS,
  unwrapRhEnvelope,
} from "./rhService.contract";

export const rhRequestsService = {
  async listCategories(filters: RhCategoryListFilters = {}): Promise<RhCategory[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.categories, {
      params: buildRhCategoryListParams(filters),
    });

    return unwrapRhEnvelope<RhCategory[]>(response.data);
  },

  async createCategory(payload: CreateRhCategoryPayload): Promise<RhCategory> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.categories, payload);

    return unwrapRhEnvelope<RhCategory>(response.data);
  },

  async updateCategory(payload: UpdateRhCategoryPayload): Promise<RhCategory> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.categories, payload);

    return unwrapRhEnvelope<RhCategory>(response.data);
  },

  async deleteCategory(payload: DeleteRhCategoryPayload): Promise<RhMutationMessage> {
    const api = setupAPIClient();
    const response = await api.delete(RH_ENDPOINTS.categories, { data: payload });

    return unwrapRhEnvelope<RhMutationMessage>(response.data);
  },

  async listRequests(filters: RhRequestListFilters = {}): Promise<RhRequest[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.requests, {
      params: buildRhRequestListParams(filters),
    });

    return unwrapRhEnvelope<RhRequest[]>(response.data);
  },

  async getRequestById(id: string): Promise<RhRequest> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.requestDetail(id));

    return unwrapRhEnvelope<RhRequest>(response.data);
  },

  async createRequest(payload: CreateRhRequestPayload): Promise<RhRequest> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.requests, payload);

    return unwrapRhEnvelope<RhRequest>(response.data);
  },

  async updateRequest(payload: UpdateRhRequestPayload): Promise<RhRequest> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.requests, payload);

    return unwrapRhEnvelope<RhRequest>(response.data);
  },

  async deleteRequest(payload: DeleteRhRequestPayload): Promise<RhMutationMessage> {
    const api = setupAPIClient();
    const response = await api.delete(RH_ENDPOINTS.requests, { data: payload });

    return unwrapRhEnvelope<RhMutationMessage>(response.data);
  },

  async listMessages(filters: RhMessageListFilters): Promise<RhMessage[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.messages, {
      params: { requestId: filters.requestId },
    });

    return unwrapRhEnvelope<RhMessage[]>(response.data);
  },

  async createMessage(payload: CreateRhMessagePayload): Promise<RhMessage> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.messages, payload);

    return unwrapRhEnvelope<RhMessage>(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

import type {
  CreateRhCategoryPayload,
  CreateRhMessagePayload,
  CreateRhRequestPayload,
  CreateRhMessageInput,
  DeleteRhCategoryPayload,
  DeleteRhRequestPayload,
  RhCategory,
  RhCategoryListFilters,
  RhMessage,
  RhMessageListFilters,
  RhMutationMessage,
  RhRequest,
  RhRequestListFilters,
  RhRequestListPage,
  RhNotification,
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

  async listRequests(filters: RhRequestListFilters = {}): Promise<RhRequestListPage> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.requests, {
      params: buildRhRequestListParams(filters),
    });

    return unwrapRhEnvelope<RhRequestListPage>(response.data);
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

  async createMessageWithAttachment(input: CreateRhMessageInput): Promise<RhMessage> {
    const api = setupAPIClient();
    if (!input.file) return this.createMessage(input.payload);

    const formData = new FormData();
    formData.append("request_id", input.payload.request_id);
    formData.append("message", input.payload.message);
    formData.append("type", input.payload.type);
    formData.append("file", input.file);
    const response = await api.post(RH_ENDPOINTS.messages, formData);
    return unwrapRhEnvelope<RhMessage>(response.data);
  },

  async listNotifications(): Promise<RhNotification[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.notifications);
    return unwrapRhEnvelope<RhNotification[]>(response.data);
  },

  async markNotificationRead(payload: { id?: string; request_id?: string; all?: boolean }) {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.markNotificationsRead, payload);
    return unwrapRhEnvelope<{ count: number }>(response.data);
  },
};

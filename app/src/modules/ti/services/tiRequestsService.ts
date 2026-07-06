import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiRequest,
  TiRequestAssignPayload,
  TiRequestCategory,
  TiRequestCategoryPayload,
  TiRequestMessage,
  TiRequestMessagePayload,
  TiRequestPayload,
  TiRequestStatusPayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiRequestsService = {
  async list(filters?: TiListFilters): Promise<TiRequest[]> {
    const response = await api.get(TI_ENDPOINTS.requests.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiRequest>(response.data);
  },

  async create(payload: TiRequestPayload): Promise<TiRequest> {
    const response = await api.post<TiEnvelope<TiRequest>>(TI_ENDPOINTS.requests.base, payload);

    return unwrapTiEnvelope<TiRequest>(response.data);
  },

  async getById(id: TiId): Promise<TiRequest> {
    const response = await api.get<TiEnvelope<TiRequest>>(
      buildTiPath(TI_ENDPOINTS.requests.detail, id),
    );

    return unwrapTiEnvelope<TiRequest>(response.data);
  },

  async update(id: TiId, payload: TiRequestPayload): Promise<TiRequest> {
    const response = await api.patch<TiEnvelope<TiRequest>>(
      buildTiPath(TI_ENDPOINTS.requests.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiRequest>(response.data);
  },

  async assign(id: TiId, payload: TiRequestAssignPayload): Promise<TiRequest> {
    const response = await api.patch<TiEnvelope<TiRequest>>(
      buildTiPath(TI_ENDPOINTS.requests.assign, id),
      payload,
    );

    return unwrapTiEnvelope<TiRequest>(response.data);
  },

  async updateStatus(id: TiId, payload: TiRequestStatusPayload): Promise<TiRequest> {
    const response = await api.patch<TiEnvelope<TiRequest>>(
      buildTiPath(TI_ENDPOINTS.requests.status, id),
      payload,
    );

    return unwrapTiEnvelope<TiRequest>(response.data);
  },

  async listMessages(id: TiId): Promise<TiRequestMessage[]> {
    const response = await api.get(buildTiPath(TI_ENDPOINTS.requests.messages, id));

    return unwrapTiList<TiRequestMessage>(response.data);
  },

  async createMessage(id: TiId, payload: TiRequestMessagePayload): Promise<TiRequestMessage> {
    const response = await api.post<TiEnvelope<TiRequestMessage>>(
      buildTiPath(TI_ENDPOINTS.requests.messages, id),
      payload,
    );

    return unwrapTiEnvelope<TiRequestMessage>(response.data);
  },

  async listCategories(filters?: TiListFilters): Promise<TiRequestCategory[]> {
    const response = await api.get(TI_ENDPOINTS.requestCategories.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiRequestCategory>(response.data);
  },

  async createCategory(payload: TiRequestCategoryPayload): Promise<TiRequestCategory> {
    const response = await api.post<TiEnvelope<TiRequestCategory>>(
      TI_ENDPOINTS.requestCategories.base,
      payload,
    );

    return unwrapTiEnvelope<TiRequestCategory>(response.data);
  },

  async updateCategory(id: TiId, payload: TiRequestCategoryPayload): Promise<TiRequestCategory> {
    const response = await api.patch<TiEnvelope<TiRequestCategory>>(
      buildTiPath(TI_ENDPOINTS.requestCategories.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiRequestCategory>(response.data);
  },
};

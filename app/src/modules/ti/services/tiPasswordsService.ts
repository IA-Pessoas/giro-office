import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListResponse,
  TiPasswordCreatePayload,
  TiPasswordDeactivatePayload,
  TiPasswordDetail,
  TiPasswordListFilters,
  TiPasswordListItem,
  TiPasswordUpdatePayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiListResponse,
} from "./tiService.contract";

export const tiPasswordsService = {
  async listPasswords(filters?: TiPasswordListFilters): Promise<TiListResponse<TiPasswordListItem>> {
    const response = await api.get(TI_ENDPOINTS.passwords.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiListResponse<TiPasswordListItem>(response.data);
  },

  async createPassword(payload: TiPasswordCreatePayload): Promise<TiPasswordListItem> {
    const response = await api.post<TiEnvelope<TiPasswordListItem>>(
      TI_ENDPOINTS.passwords.base,
      payload,
    );

    return unwrapTiEnvelope<TiPasswordListItem>(response.data);
  },

  async getPasswordById(id: TiId): Promise<TiPasswordDetail> {
    const response = await api.get<TiEnvelope<TiPasswordDetail>>(
      buildTiPath(TI_ENDPOINTS.passwords.detail, id),
    );

    return unwrapTiEnvelope<TiPasswordDetail>(response.data);
  },

  async updatePassword(
    id: TiId,
    payload: TiPasswordUpdatePayload,
  ): Promise<TiPasswordListItem> {
    const response = await api.patch<TiEnvelope<TiPasswordListItem>>(
      buildTiPath(TI_ENDPOINTS.passwords.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiPasswordListItem>(response.data);
  },

  async deactivatePassword(
    id: TiId,
    payload: TiPasswordDeactivatePayload,
  ): Promise<TiPasswordListItem> {
    const response = await api.post<TiEnvelope<TiPasswordListItem>>(
      buildTiPath(TI_ENDPOINTS.passwords.deactivate, id),
      payload,
    );

    return unwrapTiEnvelope<TiPasswordListItem>(response.data);
  },
};

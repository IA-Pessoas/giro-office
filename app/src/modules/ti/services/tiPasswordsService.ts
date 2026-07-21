import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiPasswordCreatePayload,
  TiPasswordDetail,
  TiPasswordListItem,
  TiPasswordUpdatePayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiPasswordsService = {
  async listPasswords(filters?: TiListFilters): Promise<TiPasswordListItem[]> {
    const response = await api.get(TI_ENDPOINTS.passwords.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiPasswordListItem>(response.data);
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
};

import { api } from "@shared/services/apiClient";

import type { TiEnvelope, TiId, TiListFilters, TiPassword, TiPasswordPayload } from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiPasswordsService = {
  async list(filters?: TiListFilters): Promise<TiPassword[]> {
    const response = await api.get(TI_ENDPOINTS.passwords.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiPassword>(response.data);
  },

  async create(payload: TiPasswordPayload): Promise<TiPassword> {
    const response = await api.post<TiEnvelope<TiPassword>>(TI_ENDPOINTS.passwords.base, payload);

    return unwrapTiEnvelope<TiPassword>(response.data);
  },

  async getById(id: TiId): Promise<TiPassword> {
    const response = await api.get<TiEnvelope<TiPassword>>(
      buildTiPath(TI_ENDPOINTS.passwords.detail, id),
    );

    return unwrapTiEnvelope<TiPassword>(response.data);
  },

  async update(id: TiId, payload: TiPasswordPayload): Promise<TiPassword> {
    const response = await api.patch<TiEnvelope<TiPassword>>(
      buildTiPath(TI_ENDPOINTS.passwords.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiPassword>(response.data);
  },
};

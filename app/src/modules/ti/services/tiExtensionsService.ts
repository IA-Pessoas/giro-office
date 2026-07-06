import { api } from "@shared/services/apiClient";

import type { TiEnvelope, TiExtension, TiExtensionPayload, TiId, TiListFilters } from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiExtensionsService = {
  async list(filters?: TiListFilters): Promise<TiExtension[]> {
    const response = await api.get(TI_ENDPOINTS.extensions.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiExtension>(response.data);
  },

  async create(payload: TiExtensionPayload): Promise<TiExtension> {
    const response = await api.post<TiEnvelope<TiExtension>>(TI_ENDPOINTS.extensions.base, payload);

    return unwrapTiEnvelope<TiExtension>(response.data);
  },

  async getById(id: TiId): Promise<TiExtension> {
    const response = await api.get<TiEnvelope<TiExtension>>(
      buildTiPath(TI_ENDPOINTS.extensions.detail, id),
    );

    return unwrapTiEnvelope<TiExtension>(response.data);
  },

  async update(id: TiId, payload: TiExtensionPayload): Promise<TiExtension> {
    const response = await api.patch<TiEnvelope<TiExtension>>(
      buildTiPath(TI_ENDPOINTS.extensions.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiExtension>(response.data);
  },
};

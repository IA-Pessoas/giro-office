import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiTerm,
  TiTermPayload,
  TiTermSignPayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiTermsService = {
  async list(filters?: TiListFilters): Promise<TiTerm[]> {
    const response = await api.get(TI_ENDPOINTS.terms.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiTerm>(response.data);
  },

  async create(payload: TiTermPayload): Promise<TiTerm> {
    const response = await api.post<TiEnvelope<TiTerm>>(TI_ENDPOINTS.terms.base, payload);

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async getById(id: TiId): Promise<TiTerm> {
    const response = await api.get<TiEnvelope<TiTerm>>(buildTiPath(TI_ENDPOINTS.terms.detail, id));

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async update(id: TiId, payload: TiTermPayload): Promise<TiTerm> {
    const response = await api.patch<TiEnvelope<TiTerm>>(
      buildTiPath(TI_ENDPOINTS.terms.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async sign(id: TiId, payload: TiTermSignPayload = {}): Promise<TiTerm> {
    const response = await api.patch<TiEnvelope<TiTerm>>(
      buildTiPath(TI_ENDPOINTS.terms.sign, id),
      payload,
    );

    return unwrapTiEnvelope<TiTerm>(response.data);
  },
};

import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiTerm,
  TiTermPayload,
  TiTermSignPayload,
  TiTermUpdatePayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiTermsService = {
  async listTerms(filters?: TiListFilters): Promise<TiTerm[]> {
    const response = await api.get(TI_ENDPOINTS.terms.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiTerm>(response.data);
  },

  async createTerm(payload: TiTermPayload): Promise<TiTerm> {
    const response = await api.post<TiEnvelope<TiTerm>>(TI_ENDPOINTS.terms.base, payload);

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async getTermById(id: TiId): Promise<TiTerm> {
    const response = await api.get<TiEnvelope<TiTerm>>(buildTiPath(TI_ENDPOINTS.terms.detail, id));

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async updateTerm(id: TiId, payload: TiTermUpdatePayload): Promise<TiTerm> {
    const response = await api.patch<TiEnvelope<TiTerm>>(
      buildTiPath(TI_ENDPOINTS.terms.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiTerm>(response.data);
  },

  async signTerm(id: TiId, payload: TiTermSignPayload = {}): Promise<TiTerm> {
    const response = await api.patch<TiEnvelope<TiTerm>>(
      buildTiPath(TI_ENDPOINTS.terms.sign, id),
      payload,
    );

    return unwrapTiEnvelope<TiTerm>(response.data);
  },
};

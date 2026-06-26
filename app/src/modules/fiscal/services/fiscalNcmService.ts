import { setupAPIClient } from "@shared/services/api";

import type {
  CreateFiscalNcmPayload,
  FiscalNcm,
  FiscalNcmListFilters,
  UpdateFiscalNcmPayload,
} from "../types";
import {
  buildFiscalNcmDetailParams,
  buildFiscalNcmListParams,
  FISCAL_ENDPOINTS,
  unwrapFiscalCreate,
  unwrapFiscalDetail,
  unwrapFiscalEnvelope,
  unwrapFiscalMutation,
} from "./fiscalService.contract";

export const fiscalNcmService = {
  async list(filters: FiscalNcmListFilters = {}): Promise<FiscalNcm[]> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.ncmList, {
      params: buildFiscalNcmListParams(filters),
    });

    return unwrapFiscalEnvelope<FiscalNcm[]>(response.data);
  },

  async detail(ncmId: string): Promise<FiscalNcm> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.ncm, {
      params: buildFiscalNcmDetailParams(ncmId),
    });

    return unwrapFiscalDetail<FiscalNcm>(response.data);
  },

  async create(payload: CreateFiscalNcmPayload): Promise<FiscalNcm> {
    const api = setupAPIClient();
    const response = await api.post(FISCAL_ENDPOINTS.ncm, payload);

    return unwrapFiscalCreate<FiscalNcm>(response.data);
  },

  async update(payload: UpdateFiscalNcmPayload): Promise<FiscalNcm> {
    const api = setupAPIClient();
    const response = await api.put(FISCAL_ENDPOINTS.ncm, payload);

    return unwrapFiscalMutation<FiscalNcm>(response.data);
  },
};

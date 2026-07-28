import { setupAPIClient } from "@shared/services/api";

import type {
  CreateFiscalIcmsPayload,
  FiscalIcms,
  FiscalIcmsListFilters,
  FiscalIcmsListResult,
  UpdateFiscalIcmsPayload,
} from "../types";
import {
  buildFiscalIcmsDetailParams,
  buildFiscalIcmsListParams,
  FISCAL_ENDPOINTS,
  unwrapFiscalCreate,
  unwrapFiscalDetail,
  unwrapFiscalPaginatedEnvelope,
  unwrapFiscalMutation,
} from "./fiscalService.contract";

export const fiscalIcmsService = {
  async list(filters: FiscalIcmsListFilters = {}): Promise<FiscalIcmsListResult> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.icmsList, {
      params: buildFiscalIcmsListParams(filters),
    });

    return unwrapFiscalPaginatedEnvelope<FiscalIcms>(response.data, {
      page: filters.page ?? 1,
      limit: filters.page_size ?? 50,
    });
  },

  async detail(icmsId: string): Promise<FiscalIcms> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.icms, {
      params: buildFiscalIcmsDetailParams(icmsId),
    });

    return unwrapFiscalDetail<FiscalIcms>(response.data);
  },

  async create(payload: CreateFiscalIcmsPayload): Promise<FiscalIcms> {
    const api = setupAPIClient();
    const response = await api.post(FISCAL_ENDPOINTS.icms, payload);

    return unwrapFiscalCreate<FiscalIcms>(response.data);
  },

  async update(payload: UpdateFiscalIcmsPayload): Promise<FiscalIcms> {
    const api = setupAPIClient();
    const response = await api.put(FISCAL_ENDPOINTS.icms, payload);

    return unwrapFiscalMutation<FiscalIcms>(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

import type {
  CreateFiscalIpiPayload,
  FiscalIpi,
  FiscalIpiListFilters,
  FiscalIpiListResult,
  UpdateFiscalIpiPayload,
} from "../types";
import {
  buildFiscalIpiDetailParams,
  buildFiscalIpiListParams,
  FISCAL_ENDPOINTS,
  unwrapFiscalCreate,
  unwrapFiscalDetail,
  unwrapFiscalPaginatedEnvelope,
  unwrapFiscalMutation,
} from "./fiscalService.contract";

export const fiscalIpiService = {
  async list(filters: FiscalIpiListFilters = {}): Promise<FiscalIpiListResult> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.ipiList, {
      params: buildFiscalIpiListParams(filters),
    });

    return unwrapFiscalPaginatedEnvelope<FiscalIpi>(response.data, {
      page: filters.page ?? 1,
      limit: filters.page_size ?? 50,
    });
  },

  async detail(ipiId: string): Promise<FiscalIpi> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.ipi, {
      params: buildFiscalIpiDetailParams(ipiId),
    });

    return unwrapFiscalDetail<FiscalIpi>(response.data);
  },

  async create(payload: CreateFiscalIpiPayload): Promise<FiscalIpi> {
    const api = setupAPIClient();
    const response = await api.post(FISCAL_ENDPOINTS.ipi, payload);

    return unwrapFiscalCreate<FiscalIpi>(response.data);
  },

  async update(payload: UpdateFiscalIpiPayload): Promise<FiscalIpi> {
    const api = setupAPIClient();
    const response = await api.put(FISCAL_ENDPOINTS.ipi, payload);

    return unwrapFiscalMutation<FiscalIpi>(response.data);
  },

  async delete(ipiId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(FISCAL_ENDPOINTS.ipi, {
      params: buildFiscalIpiDetailParams(ipiId),
    });
  },
};

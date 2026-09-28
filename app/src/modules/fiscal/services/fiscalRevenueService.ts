import { setupAPIClient } from "@shared/services/api";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export interface FiscalMonthlyRevenue {
  id: string;
  client_id: string;
  competence: string;
  amount: string;
  created_by: string;
  updated_by: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFiscalMonthlyRevenuePayload {
  client_id: string;
  competence: string;
  amount: string;
}

export const REVENUE_PAGE_SIZE = 24;

export const fiscalRevenueService = {
  async create(payload: CreateFiscalMonthlyRevenuePayload): Promise<FiscalMonthlyRevenue> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/revenues", payload);
    return unwrapFiscalEnvelope<FiscalMonthlyRevenue>(response.data);
  },

  async update(id: string, amount: string): Promise<FiscalMonthlyRevenue> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.put(`/fiscal/revenues/${id}`, { amount });
    return unwrapFiscalEnvelope<FiscalMonthlyRevenue>(response.data);
  },

  async list(clientId: string, page: number): Promise<PaginatedResult<FiscalMonthlyRevenue>> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/revenues/list", {
      params: { client_id: clientId, page, page_size: REVENUE_PAGE_SIZE },
    });
    return unwrapFiscalEnvelope<PaginatedResult<FiscalMonthlyRevenue>>(response.data);
  },
};

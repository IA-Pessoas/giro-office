import { setupAPIClient } from "@shared/services/api";
import { isAxiosError } from "axios";
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

export interface FiscalSimplesAnnexRate {
  annex: "I" | "II" | "III" | "IV" | "V";
  tax: "ICMS" | "ISS";
  bracket: number;
  nominal_rate: string;
  deduction: string;
  effective_rate: string;
  tax_share: string;
  rate: string;
  emission_rate: string | null;
}

export type FiscalSimplesPreviewStatus = "ok" | "no_base" | "above_limit";

export interface FiscalSimplesPreview {
  client_id: string;
  competence: string;
  applies_to: string;
  status: FiscalSimplesPreviewStatus;
  message: string | null;
  months: Array<{ competence: string; amount: string; registered: boolean }>;
  estimated_month: { competence: string; amount: string };
  rbt12: string;
  annexes: FiscalSimplesAnnexRate[];
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

  async simplesPreview(clientId: string, competence: string): Promise<FiscalSimplesPreview> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/simples/preview", {
      params: { client_id: clientId, competence },
    });
    return unwrapFiscalEnvelope<FiscalSimplesPreview>(response.data);
  },

  async downloadSimplesPdf(
    clientId: string,
    competence: string,
    annex: FiscalSimplesAnnexRate["annex"],
  ): Promise<Blob> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    try {
      const response = await api.get("/fiscal/simples/pdf", {
        params: { client_id: clientId, competence, annex },
        responseType: "blob",
      });
      return response.data as Blob;
    } catch (error) {
      // Com responseType blob o erro também chega como Blob; devolve o JSON para a mensagem.
      if (isAxiosError(error) && error.response?.data instanceof Blob) {
        try {
          error.response.data = JSON.parse(await error.response.data.text());
        } catch {
          // Corpo não é JSON: fica a mensagem padrão.
        }
      }
      throw error;
    }
  },

  async list(clientId: string, page: number): Promise<PaginatedResult<FiscalMonthlyRevenue>> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/revenues/list", {
      params: { client_id: clientId, page, page_size: REVENUE_PAGE_SIZE },
    });
    return unwrapFiscalEnvelope<PaginatedResult<FiscalMonthlyRevenue>>(response.data);
  },
};

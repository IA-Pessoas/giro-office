import { setupAPIClient } from "@shared/services/api";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export type FiscalTaxType = "ISS" | "ICMS";

export interface FiscalRate {
  id: string;
  client_id: string;
  client_name: string;
  client_document: string;
  competence: string;
  tax_type: FiscalTaxType;
  rate: string;
  issued_by: string;
  createdAt: string;
}

export interface CreateFiscalRatePayload {
  client_id: string;
  competence: string;
  tax_type: FiscalTaxType;
  rate: string;
}

export const fiscalRateService = {
  async create(payload: CreateFiscalRatePayload): Promise<FiscalRate> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/rates", payload);
    return unwrapFiscalEnvelope<FiscalRate>(response.data);
  },

  async list(clientId: string, page: number): Promise<PaginatedResult<FiscalRate>> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/rates/list", {
      params: { client_id: clientId, page, page_size: 20 },
    });
    return unwrapFiscalEnvelope<PaginatedResult<FiscalRate>>(response.data);
  },

  async download(id: string): Promise<Blob> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get(`/fiscal/rates/${id}/pdf`, { responseType: "blob" });
    return response.data as Blob;
  },
};

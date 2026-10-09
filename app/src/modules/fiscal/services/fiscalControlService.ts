import { setupAPIClient } from "@shared/services/api";

import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export type FiscalControlStatus = "PENDING" | "IN_PROGRESS" | "AWAITING_CLIENT" | "COMPLETED";

export interface FiscalMonthlyControl {
  id: string;
  client_id: string;
  client_name: string;
  competence: string;
  status: FiscalControlStatus;
  no_movement: boolean;
  regime: string | null;
  opening_reason: string | null;
  updated_by: string;
  updatedAt: string;
}

export interface FiscalMonthlyControlPortfolio {
  competence: string;
  items: FiscalMonthlyControl[];
}

export interface UpdateFiscalMonthlyControlPayload {
  status?: FiscalControlStatus;
  no_movement?: boolean;
  reason?: string;
}

export const fiscalControlService = {
  /** Lista a competência; o serviço gera antes os controles que faltam. */
  async list(competence: string): Promise<FiscalMonthlyControlPortfolio> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/monthly-controls", { params: { competence } });
    return unwrapFiscalEnvelope<FiscalMonthlyControlPortfolio>(response.data);
  },

  async open(payload: { client_id: string; competence: string; reason?: string }): Promise<{
    created: boolean;
  }> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post("/fiscal/monthly-controls", payload);
    return unwrapFiscalEnvelope<{ created: boolean }>(response.data);
  },

  async update(id: string, payload: UpdateFiscalMonthlyControlPayload): Promise<void> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    await api.patch(`/fiscal/monthly-controls/${id}`, payload);
  },
};

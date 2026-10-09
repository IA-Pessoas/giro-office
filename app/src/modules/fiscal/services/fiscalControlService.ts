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
  /** Obrigações aplicáveis ainda sem cumprimento; não mudam a situação. */
  pending_obligations: number;
  /** Documentos pendentes na Triagem; null quando ela não tem registro. */
  triage_pending: number | null;
}

export interface FiscalControlTriage {
  control_id: string;
  competence: string;
  source: "MONTHLY" | "PLANNED" | "NONE";
  pending: number | null;
  items: Array<{ field: string; status: string }>;
}

export type FiscalObligationCode = "PGDAS_D" | "DCTFWEB" | "EFD_CONTRIBUICOES" | "DIRBI";
export type FiscalObligationStatus = "PENDING" | "COMPLETED" | "NOT_APPLICABLE";

export interface FiscalMonthlyObligation {
  code: FiscalObligationCode;
  name: string;
  note: string;
  source: string;
  origin: string;
  status: FiscalObligationStatus;
  not_applicable_reason: string | null;
  completed_on: string | null;
  completed_by: string | null;
  protocol: string | null;
  updatedAt: string;
}

export interface FiscalObligationCatalogItem {
  code: FiscalObligationCode;
  name: string;
  note: string;
  source: string;
  conditional: boolean;
}

export interface FiscalMonthlyObligations {
  control_id: string;
  items: FiscalMonthlyObligation[];
  addable: FiscalObligationCatalogItem[];
}

export interface UpdateFiscalObligationPayload {
  applicable?: boolean;
  completed_on?: string | null;
  protocol?: string;
  reason?: string;
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

  /** Documentos da Triagem do mesmo cliente e competência (só leitura). */
  async triage(controlId: string): Promise<FiscalControlTriage> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get(`/fiscal/monthly-controls/${controlId}/triage`);
    return unwrapFiscalEnvelope<FiscalControlTriage>(response.data);
  },

  /** Obrigações do controle; as sugeridas nascem com ele. */
  async listObligations(controlId: string): Promise<FiscalMonthlyObligations> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get(`/fiscal/monthly-controls/${controlId}/obligations`);
    return unwrapFiscalEnvelope<FiscalMonthlyObligations>(response.data);
  },

  async addObligation(
    controlId: string,
    payload: { code: FiscalObligationCode; reason?: string },
  ): Promise<void> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    await api.post(`/fiscal/monthly-controls/${controlId}/obligations`, payload);
  },

  async updateObligation(
    controlId: string,
    code: FiscalObligationCode,
    payload: UpdateFiscalObligationPayload,
  ): Promise<void> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    await api.patch(`/fiscal/monthly-controls/${controlId}/obligations/${code}`, payload);
  },
};

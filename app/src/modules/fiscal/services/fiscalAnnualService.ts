import { setupAPIClient } from "@shared/services/api";

import {
  FISCAL_ANNUAL_CONTROLS_QUERY_KEY,
  fiscalAnnualItemsQueryKey,
} from "../hooks/queryKeys";
import type {
  FiscalControlItems,
  FiscalItemSource,
  FiscalObligationStatus,
  UpdateFiscalObligationPayload,
} from "./fiscalControlService";
import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export const FISCAL_ANNUAL_DECLARATIONS = [
  ["DEFIS", "DEFIS"],
  ["DMED", "DMED"],
  ["DIMOB", "DIMOB"],
  ["DASN_SIMEI", "DASN-SIMEI"],
] as const;

export type FiscalAnnualDeclarationCode = (typeof FISCAL_ANNUAL_DECLARATIONS)[number][0];

/** Sem situação geral: o andamento anual é o de cada declaração. */
export interface FiscalAnnualControl {
  id: string;
  client_id: string;
  client_name: string;
  year: number;
  regime: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  declarations: Array<{ code: string; status: FiscalObligationStatus; completed_on: string | null }>;
}

export const fiscalAnnualService = {
  /** Lista o ano; o serviço gera antes os controles que faltam. */
  async list(year: number): Promise<{ year: number; items: FiscalAnnualControl[] }> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get("/fiscal/annual-controls", { params: { year } });
    return unwrapFiscalEnvelope<{ year: number; items: FiscalAnnualControl[] }>(response.data);
  },

  async items(controlId: string): Promise<FiscalControlItems<FiscalAnnualDeclarationCode>> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get(`/fiscal/annual-controls/${controlId}/items`);
    return unwrapFiscalEnvelope<FiscalControlItems<FiscalAnnualDeclarationCode>>(response.data);
  },

  async addItem(
    controlId: string,
    payload: { code: FiscalAnnualDeclarationCode; reason?: string },
  ): Promise<void> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    await api.post(`/fiscal/annual-controls/${controlId}/items`, payload);
  },

  async updateItem(
    controlId: string,
    code: FiscalAnnualDeclarationCode,
    payload: UpdateFiscalObligationPayload,
  ): Promise<void> {
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    await api.patch(`/fiscal/annual-controls/${controlId}/items/${code}`, payload);
  },
};

/** Declarações do controle anual no painel de itens. */
export function annualItemSource(
  controlId: string,
): FiscalItemSource<FiscalAnnualDeclarationCode> {
  return {
    queryKey: fiscalAnnualItemsQueryKey(controlId),
    portfolioKey: FISCAL_ANNUAL_CONTROLS_QUERY_KEY,
    noun: { singular: "declaração", added: "Declaração incluída.", updated: "Declaração atualizada." },
    list: () => fiscalAnnualService.items(controlId),
    add: (payload) => fiscalAnnualService.addItem(controlId, payload),
    update: (code, payload) => fiscalAnnualService.updateItem(controlId, code, payload),
  };
}

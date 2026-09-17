import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilCompetence,
  TriageBankStatement,
  TriageDocumentStatus,
  TriageDocumentItemNotes,
  TriageDocumentsMonthly,
  TriageClosing,
  TriageClosingStatus,
} from "../types";
import {
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

type MonthlyParams = { clientId: string; competence: ContabilCompetence };
type Editability = { can_edit: boolean };

export const triageDocumentsService = {
  async getEditability(clientId: string): Promise<Editability> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageEditability, {
      params: { client_id: clientId },
    });
    return unwrapContabilEnvelope(response.data);
  },
  getMonthly(params: MonthlyParams): Promise<TriageDocumentsMonthly | null> {
    const api = setupAPIClient();
    return executeNullableContabilRequest(() =>
      api.get(CONTABIL_ENDPOINTS.triageMonthly, {
        params: { client_id: params.clientId, competence: params.competence },
      }),
    );
  },
  async createMonthly(params: MonthlyParams): Promise<TriageDocumentsMonthly> {
    const api = setupAPIClient();
    const response = await api.post(CONTABIL_ENDPOINTS.triageMonthly, {
      client_id: params.clientId,
      competence: params.competence,
    });
    return unwrapContabilEnvelope(response.data);
  },
  async updateItem(
    monthlyId: string,
    field: string,
    status: TriageDocumentStatus,
    itemNotes?: TriageDocumentItemNotes,
  ): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyItem(monthlyId),
      { field, status, ...itemNotes },
    );
    return unwrapContabilEnvelope(response.data);
  },
  async updateAll(
    monthlyId: string,
    status: TriageDocumentStatus,
  ): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyItems(monthlyId),
      { status },
    );
    return unwrapContabilEnvelope(response.data);
  },
  async getStatements(params: MonthlyParams): Promise<TriageBankStatement[]> {
    const response = await setupAPIClient().get(
      CONTABIL_ENDPOINTS.triageStatements,
      { params: { client_id: params.clientId, competence: params.competence } },
    );
    return unwrapContabilEnvelope(response.data);
  },
  async updateStatement(
    params: MonthlyParams & { bankId: string; status: TriageDocumentStatus },
  ): Promise<TriageBankStatement> {
    const response = await setupAPIClient().put(
      CONTABIL_ENDPOINTS.triageStatements,
      {
        client_id: params.clientId,
        competence: params.competence,
        bank_id: params.bankId,
        status: params.status,
      },
    );
    return unwrapContabilEnvelope(response.data);
  },
  async getClosing(params: MonthlyParams): Promise<TriageClosing> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageClosing, {
      params: { client_id: params.clientId, competence: params.competence },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async updateClosing(
    params: MonthlyParams & { status: TriageClosingStatus },
  ): Promise<TriageClosing> {
    const response = await setupAPIClient().put(CONTABIL_ENDPOINTS.triageClosing, {
      client_id: params.clientId,
      competence: params.competence,
      status: params.status,
    });
    return unwrapContabilEnvelope(response.data);
  },
};

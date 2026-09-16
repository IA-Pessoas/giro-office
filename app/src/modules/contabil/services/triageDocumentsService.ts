import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilCompetence,
  TriageBankStatement,
  TriageDocumentStatus,
  TriageDocumentsMonthly,
} from "../types";
import {
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

type MonthlyParams = { clientId: string; competence: ContabilCompetence };

export const triageDocumentsService = {
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
  ): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyItem(monthlyId),
      { field, status },
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
};

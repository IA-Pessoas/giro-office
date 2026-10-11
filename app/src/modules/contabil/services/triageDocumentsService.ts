import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilCompetence,
  FiscalTriagePortfolio,
  TriageBankStatement,
  TriageStatementHistory,
  TriageDocumentStatus,
  TriageDocumentItemNotes,
  TriageDocumentsMonthly,
  TriageClosing,
  TriageClosingStatus,
  TriageDocumentField,
  TriageDocumentHistoryPage,
  TriageFiscalSettings,
  TriageFiscalSpecialConfig,
  TriageMonthlyUpdate,
  TriageMovementConfig,
  TriageRoutineType,
} from "../types";
import {
  buildTriageItemPayload,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

type MonthlyParams = {
  clientId: string;
  competence: ContabilCompetence;
  type?: TriageRoutineType;
};
type Editability = { can_edit: boolean };

export const triageDocumentsService = {
  async getFiscalPortfolio(competence: ContabilCompetence): Promise<FiscalTriagePortfolio> {
    const response = await setupAPIClient().get("/triagem/fiscal-portfolio", {
      params: { competence },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async getEditability(clientId: string, type: TriageRoutineType = "CONTABIL"): Promise<Editability> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageEditability, {
      params: { client_id: clientId, ...(type === "FISCAL" ? { type } : {}) },
    });
    return unwrapContabilEnvelope(response.data);
  },
  getMonthly(params: MonthlyParams): Promise<TriageDocumentsMonthly | null> {
    const api = setupAPIClient();
    return executeNullableContabilRequest(() =>
      api.get(CONTABIL_ENDPOINTS.triageMonthly, {
        params: {
          client_id: params.clientId,
          competence: params.competence,
          ...(params.type ? { type: params.type } : {}),
        },
      }),
    );
  },
  async createMonthly(params: MonthlyParams): Promise<TriageDocumentsMonthly> {
    const api = setupAPIClient();
    const response = await api.post(CONTABIL_ENDPOINTS.triageMonthly, {
      client_id: params.clientId,
      competence: params.competence,
      ...(params.type ? { type: params.type } : {}),
    });
    return unwrapContabilEnvelope(response.data);
  },
  async updateItem(
    monthlyId: string,
    field: string,
    status: TriageDocumentStatus | undefined,
    itemNotes?: Partial<TriageDocumentItemNotes>,
    type: TriageRoutineType = "CONTABIL",
    value?: string | null,
  ): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyItem(monthlyId),
      buildTriageItemPayload(field, status, itemNotes, type, value),
    );
    return unwrapContabilEnvelope(response.data);
  },
  async updateAll(
    monthlyId: string,
    status: TriageDocumentStatus,
    type: TriageRoutineType = "CONTABIL",
  ): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyItems(monthlyId),
      { status, ...(type === "FISCAL" ? { type } : {}) },
    );
    return unwrapContabilEnvelope(response.data);
  },
  async updateMonthly(monthlyId: string, data: TriageMonthlyUpdate): Promise<TriageDocumentsMonthly> {
    const response = await setupAPIClient().patch(
      CONTABIL_ENDPOINTS.triageMonthlyById(monthlyId),
      data,
    );
    return unwrapContabilEnvelope(response.data);
  },
  async getMovementConfig(clientId: string): Promise<TriageMovementConfig> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageConfig, {
      params: { client_id: clientId },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async saveMovementConfig(
    clientId: string,
    activeItems: TriageDocumentField[],
  ): Promise<TriageMovementConfig> {
    const response = await setupAPIClient().put(CONTABIL_ENDPOINTS.triageConfig, {
      client_id: clientId,
      active_items: activeItems,
    });
    return unwrapContabilEnvelope(response.data);
  },
  async getFiscalSpecialConfig(clientId: string): Promise<TriageFiscalSpecialConfig> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageConfig, {
      params: { client_id: clientId, type: "FISCAL" },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async saveFiscalSpecialConfig(
    clientId: string,
    activeItems: TriageFiscalSpecialConfig["active_items"],
  ): Promise<TriageFiscalSpecialConfig> {
    const response = await setupAPIClient().put(CONTABIL_ENDPOINTS.triageConfig, {
      client_id: clientId,
      type: "FISCAL",
      active_items: activeItems,
    });
    return unwrapContabilEnvelope(response.data);
  },
  async getFiscalSettings(clientId: string): Promise<TriageFiscalSettings> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageFiscalSettings, {
      params: { client_id: clientId },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async saveFiscalSettings(
    clientId: string,
    settings: Pick<TriageFiscalSettings, "priority" | "delivery_method">,
  ): Promise<TriageFiscalSettings> {
    const response = await setupAPIClient().put(CONTABIL_ENDPOINTS.triageFiscalSettings, {
      client_id: clientId,
      ...settings,
    });
    return unwrapContabilEnvelope(response.data);
  },
  async getDocumentHistory(filters: {
    clientId?: string;
    competence?: ContabilCompetence;
    page: number;
    pageSize: number;
  }): Promise<TriageDocumentHistoryPage> {
    const response = await setupAPIClient().get("/triagem/documents/history", {
      params: {
        ...(filters.clientId ? { client_id: filters.clientId } : {}),
        ...(filters.competence ? { competence: filters.competence } : {}),
        page: filters.page,
        pageSize: filters.pageSize,
      },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async getStatementHistory(
    clientId: string,
    pendingOnly: boolean,
  ): Promise<TriageStatementHistory> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.triageStatementHistory, {
      params: { client_id: clientId, ...(pendingOnly ? { pending: "true" } : {}) },
    });
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
  async archiveStatement(params: MonthlyParams & { bankId: string }): Promise<TriageBankStatement> {
    const response = await setupAPIClient().delete(CONTABIL_ENDPOINTS.triageStatements, {
      data: {
        client_id: params.clientId,
        competence: params.competence,
        bank_id: params.bankId,
      },
    });
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

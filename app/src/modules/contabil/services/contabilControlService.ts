import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilControl,
  ContabilControlFilters,
  ContabilControlHistoryPage,
  ContabilCompetence,
  ContabilControlPortfolio,
  ContabilCompetenceOperationPayload,
  CreateYearContabilControlsPayload,
  CreateOrGetContabilControlPayload,
  PatchContabilControlFieldPayload,
} from "../types";
import {
  buildContabilControlParams,
  buildContabilPortfolioParams,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

export const contabilControlService = {
  async getPortfolio(competence: ContabilCompetence): Promise<ContabilControlPortfolio> {
    const api = setupAPIClient();
    const response = await api.get(CONTABIL_ENDPOINTS.controlsList, {
      params: buildContabilPortfolioParams(competence),
    });

    return unwrapContabilEnvelope<ContabilControlPortfolio>(response.data);
  },

  async createOrGetControl(
    payload: CreateOrGetContabilControlPayload,
  ): Promise<ContabilControl> {
    const api = setupAPIClient();
    const response = await api.post(CONTABIL_ENDPOINTS.controls, payload);

    return unwrapContabilEnvelope<ContabilControl>(response.data);
  },

  async getControl(filters: ContabilControlFilters): Promise<ContabilControl | null> {
    const api = setupAPIClient();
    return executeNullableContabilRequest<ContabilControl>(() =>
      api.get(CONTABIL_ENDPOINTS.controls, {
        params: buildContabilControlParams(filters),
      }),
    );
  },

  async getHistory(
    filters: ContabilControlFilters,
    page: number,
    pageSize: number,
  ): Promise<ContabilControlHistoryPage> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.controlsHistory, {
      params: { ...buildContabilControlParams(filters), page, pageSize },
    });
    return unwrapContabilEnvelope<ContabilControlHistoryPage>(response.data);
  },

  async patchControlField(
    controlId: string,
    payload: PatchContabilControlFieldPayload,
  ): Promise<ContabilControl> {
    const api = setupAPIClient();
    const response = await api.patch(CONTABIL_ENDPOINTS.controlById(controlId), payload);

    return unwrapContabilEnvelope<ContabilControl>(response.data);
  },

  async completeAll(controlId: string): Promise<ContabilControl> {
    const response = await setupAPIClient().patch(CONTABIL_ENDPOINTS.controlItems(controlId));
    return unwrapContabilEnvelope<ContabilControl>(response.data);
  },

  async createYear(payload: CreateYearContabilControlsPayload): Promise<{ competences: string[]; created: number; existing: number }> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.controlsYear, payload);
    return unwrapContabilEnvelope(response.data);
  },

  async archiveCompetence(payload: ContabilCompetenceOperationPayload): Promise<Record<string, number>> {
    const response = await setupAPIClient().delete(CONTABIL_ENDPOINTS.controls, { data: payload });
    return unwrapContabilEnvelope(response.data);
  },

  async restoreCompetence(payload: ContabilCompetenceOperationPayload): Promise<Record<string, number>> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.controlsRestore, payload);
    return unwrapContabilEnvelope(response.data);
  },
};

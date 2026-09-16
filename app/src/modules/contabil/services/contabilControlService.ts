import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilControl,
  ContabilControlFilters,
  ContabilCompetence,
  ContabilControlPortfolio,
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

  async patchControlField(
    controlId: string,
    payload: PatchContabilControlFieldPayload,
  ): Promise<ContabilControl> {
    const api = setupAPIClient();
    const response = await api.patch(CONTABIL_ENDPOINTS.controlById(controlId), payload);

    return unwrapContabilEnvelope<ContabilControl>(response.data);
  },
};

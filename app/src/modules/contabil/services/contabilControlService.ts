import { setupAPIClient } from "@shared/services/api";

import type {
  ContabilControl,
  ContabilControlFilters,
  CreateOrGetContabilControlPayload,
  PatchContabilControlFieldPayload,
} from "../types";
import {
  buildContabilControlParams,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  unwrapContabilEnvelope,
} from "./contabilService.contract";

export const contabilControlService = {
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

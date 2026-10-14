import { api } from "@shared/services/apiClient";

import type { TiEnvelope, TiSpecificAccess } from "../types";
import { buildTiPath, TI_ENDPOINTS, unwrapTiEnvelope } from "./tiService.contract";

export const tiSpecificAccessesService = {
  async listSpecificAccesses(): Promise<TiSpecificAccess[]> {
    const response = await api.get<TiEnvelope<TiSpecificAccess[]>>(
      TI_ENDPOINTS.specificAccesses.list,
    );

    return unwrapTiEnvelope<TiSpecificAccess[]>(response.data);
  },

  async setTaskCompletion(userId: string, taskCompletion: boolean): Promise<TiSpecificAccess> {
    const response = await api.patch<TiEnvelope<TiSpecificAccess>>(
      buildTiPath(TI_ENDPOINTS.specificAccesses.detail, userId),
      { task_completion: taskCompletion },
    );

    return unwrapTiEnvelope<TiSpecificAccess>(response.data);
  },
};

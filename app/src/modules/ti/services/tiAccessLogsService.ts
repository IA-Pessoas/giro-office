import { api } from "@shared/services/apiClient";

import type { TiAccessLogList, TiEnvelope, TiId } from "../types";
import { buildTiPath, TI_ENDPOINTS, unwrapTiEnvelope } from "./tiService.contract";

export const TI_ACCESS_LOGS_PAGE_SIZE = 20;

export const tiAccessLogsService = {
  async listUserAccessLogs(userId: TiId, page: number): Promise<TiAccessLogList> {
    const response = await api.get<TiEnvelope<TiAccessLogList>>(
      buildTiPath(TI_ENDPOINTS.accessLogs.byUser, userId),
      { params: { page, page_size: TI_ACCESS_LOGS_PAGE_SIZE } },
    );

    return unwrapTiEnvelope<TiAccessLogList>(response.data);
  },
};

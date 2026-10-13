import { api } from "@shared/services/apiClient";

import type { TiChangeHistoryItemType, TiChangeHistoryList, TiEnvelope } from "../types";
import { buildTiListParams, TI_ENDPOINTS, unwrapTiEnvelope } from "./tiService.contract";

export const TI_CHANGE_HISTORY_PAGE_SIZE = 20;

export const tiChangeHistoryService = {
  async listChangeHistory(
    itemType: TiChangeHistoryItemType | undefined,
    page: number,
  ): Promise<TiChangeHistoryList> {
    const response = await api.get<TiEnvelope<TiChangeHistoryList>>(
      TI_ENDPOINTS.changeHistory.list,
      {
        params: buildTiListParams({
          item_type: itemType,
          page,
          page_size: TI_CHANGE_HISTORY_PAGE_SIZE,
        }),
      },
    );

    return unwrapTiEnvelope<TiChangeHistoryList>(response.data);
  },
};

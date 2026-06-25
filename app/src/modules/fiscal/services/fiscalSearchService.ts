import { setupAPIClient } from "@shared/services/api";

import type { FiscalNcmSearchResult } from "../types";
import {
  buildFiscalNcmSearchParams,
  FISCAL_ENDPOINTS,
  unwrapFiscalEnvelope,
} from "./fiscalService.contract";

export const fiscalSearchService = {
  async searchByNcmCode(ncmCode: string): Promise<FiscalNcmSearchResult> {
    const api = setupAPIClient();
    const response = await api.get(FISCAL_ENDPOINTS.ncmSearch, {
      params: buildFiscalNcmSearchParams({ ncmCode }),
    });

    return unwrapFiscalEnvelope<FiscalNcmSearchResult>(response.data);
  },
};

import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import type { FiscalNcmSearchResult } from "../types";
import { fiscalSearchService } from "../services/fiscalSearchService";
import { fiscalNcmSearchQueryKey } from "./queryKeys";

export function useFiscalNcmSearch(
  submittedNcmCode: string | undefined,
): UseQueryResult<FiscalNcmSearchResult, Error> {
  const normalizedCode = submittedNcmCode?.trim() ?? "";

  return useFetch(
    fiscalNcmSearchQueryKey(normalizedCode || "missing"),
    () => fiscalSearchService.searchByNcmCode(normalizedCode),
    {
      enabled: Boolean(normalizedCode),
      placeholderData: keepPreviousData,
    },
  );
}

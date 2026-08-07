import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalNcmService } from "../services";
import type { FiscalNcmListFilters, FiscalNcmListResult } from "../types";
import { FISCAL_LIST_PAGE_SIZE, fiscalNcmListQueryKey } from "./queryKeys";

export function useFiscalNcmList(
  filters: FiscalNcmListFilters = {},
  enabled = true,
): UseQueryResult<FiscalNcmListResult, Error> {
  const listFilters = {
    ...filters,
    page: filters.page ?? 1,
    page_size: filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  };

  return useFetch(
    fiscalNcmListQueryKey(listFilters),
    () => fiscalNcmService.list(listFilters),
    {
      enabled,
      placeholderData: keepPreviousData,
    },
  );
}

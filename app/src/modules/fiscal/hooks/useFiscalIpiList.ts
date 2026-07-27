import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIpiService } from "../services";
import type { FiscalIpiListFilters, FiscalIpiListResult } from "../types";
import { FISCAL_LIST_PAGE_SIZE, fiscalIpiListQueryKey } from "./queryKeys";

export function useFiscalIpiList(
  filters: FiscalIpiListFilters = {},
  enabled = true,
): UseQueryResult<FiscalIpiListResult, Error> {
  const listFilters = {
    ...filters,
    page: filters.page ?? 1,
    page_size: filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  };

  return useFetch(
    fiscalIpiListQueryKey(listFilters),
    () => fiscalIpiService.list(listFilters),
    {
      enabled,
      placeholderData: keepPreviousData,
    },
  );
}

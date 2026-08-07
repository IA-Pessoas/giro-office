import { keepPreviousData, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { fiscalIcmsService } from "../services";
import type { FiscalIcmsListFilters, FiscalIcmsListResult } from "../types";
import { FISCAL_LIST_PAGE_SIZE, fiscalIcmsListQueryKey } from "./queryKeys";

export function useFiscalIcmsList(
  filters: FiscalIcmsListFilters = {},
  enabled = true,
): UseQueryResult<FiscalIcmsListResult, Error> {
  const listFilters = {
    ...filters,
    page: filters.page ?? 1,
    page_size: filters.page_size ?? FISCAL_LIST_PAGE_SIZE,
  };

  return useFetch(
    fiscalIcmsListQueryKey(listFilters),
    () => fiscalIcmsService.list(listFilters),
    {
      enabled,
      placeholderData: keepPreviousData,
    },
  );
}

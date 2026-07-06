import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiTermsService } from "../services";
import type { TiId, TiListFilters, TiReadQueryOptions, TiTerm } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiTerms(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiTerm[], Error> {
  return useFetch(tiQueryKeys.terms.list(filters), () => tiTermsService.list(filters), options);
}

export function useTiTerm(id?: TiId, options?: TiReadQueryOptions): UseQueryResult<TiTerm, Error> {
  return useFetch(tiQueryKeys.terms.detail(id), () => tiTermsService.getById(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

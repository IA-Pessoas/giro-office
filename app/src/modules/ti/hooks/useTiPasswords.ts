import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiPasswordsService } from "../services";
import type { TiId, TiListFilters, TiPassword, TiReadQueryOptions } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiPasswords(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiPassword[], Error> {
  return useFetch(tiQueryKeys.passwords.list(filters), () => tiPasswordsService.list(filters), options);
}

export function useTiPassword(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiPassword, Error> {
  return useFetch(tiQueryKeys.passwords.detail(id), () => tiPasswordsService.getById(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiExtensionsService } from "../services";
import type { TiExtension, TiId, TiListFilters, TiReadQueryOptions } from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiExtensions(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiExtension[], Error> {
  return useFetch(tiQueryKeys.extensions.list(filters), () => tiExtensionsService.list(filters), options);
}

export function useTiExtension(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiExtension, Error> {
  return useFetch(tiQueryKeys.extensions.detail(id), () => tiExtensionsService.getById(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

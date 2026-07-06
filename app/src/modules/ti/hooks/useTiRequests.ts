import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiRequestsService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiRequest,
  TiRequestCategory,
  TiRequestMessage,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiRequests(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequest[], Error> {
  return useFetch(tiQueryKeys.requests.list(filters), () => tiRequestsService.list(filters), options);
}

export function useTiRequest(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequest, Error> {
  return useFetch(
    tiQueryKeys.requests.detail(id),
    () => tiRequestsService.getById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRequestMessages(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequestMessage[], Error> {
  return useFetch(
    tiQueryKeys.requests.messages(id),
    () => tiRequestsService.listMessages(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRequestCategories(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequestCategory[], Error> {
  return useFetch(
    tiQueryKeys.requests.categories(filters),
    () => tiRequestsService.listCategories(filters),
    options,
  );
}

import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiInventoryService } from "../services";
import type {
  TiId,
  TiInventoryAsset,
  TiInventoryCategory,
  TiInventoryLocation,
  TiListFilters,
  TiReadQueryOptions,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiInventory(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryAsset[], Error> {
  return useFetch(tiQueryKeys.inventory.list(filters), () => tiInventoryService.list(filters), options);
}

export function useTiInventoryAsset(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryAsset, Error> {
  return useFetch(
    tiQueryKeys.inventory.detail(id),
    () => tiInventoryService.getById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiInventoryCategories(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryCategory[], Error> {
  return useFetch(
    tiQueryKeys.inventory.categories(filters),
    () => tiInventoryService.listCategories(filters),
    options,
  );
}

export function useTiInventoryLocations(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryLocation[], Error> {
  return useFetch(
    tiQueryKeys.inventory.locations(filters),
    () => tiInventoryService.listLocations(filters),
    options,
  );
}

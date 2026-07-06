import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiStockService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiStockCategory,
  TiStockItem,
  TiStockLocation,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

export function useTiStockItems(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockItem[], Error> {
  return useFetch(tiQueryKeys.stock.items(filters), () => tiStockService.listItems(filters), options);
}

export function useTiStockItem(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockItem, Error> {
  return useFetch(tiQueryKeys.stock.item(id), () => tiStockService.getItem(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

export function useTiStockCategories(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockCategory[], Error> {
  return useFetch(
    tiQueryKeys.stock.categories(filters),
    () => tiStockService.listCategories(filters),
    options,
  );
}

export function useTiStockLocations(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockLocation[], Error> {
  return useFetch(
    tiQueryKeys.stock.locations(filters),
    () => tiStockService.listLocations(filters),
    options,
  );
}

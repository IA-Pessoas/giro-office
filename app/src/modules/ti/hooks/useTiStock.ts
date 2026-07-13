import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiStockService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiStockCategory,
  TiStockCategoryCreatePayload,
  TiStockCategoryUpdatePayload,
  TiStockEntryPayload,
  TiStockExitPayload,
  TiStockItem,
  TiStockItemCreatePayload,
  TiStockItemUpdatePayload,
  TiStockLocation,
  TiStockLocationCreatePayload,
  TiStockLocationUpdatePayload,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiStockItemMutationVariables = {
  id: TiId;
  payload: TiStockItemUpdatePayload;
};

type TiStockMovementMutationVariables<TPayload> = {
  id: TiId;
  payload: TPayload;
};

type TiStockCategoryMutationVariables = {
  id: TiId;
  payload: TiStockCategoryUpdatePayload;
};

type TiStockLocationMutationVariables = {
  id: TiId;
  payload: TiStockLocationUpdatePayload;
};

function useInvalidateTiStockCaches() {
  const queryClient = useQueryClient();

  return async (id?: TiId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tiQueryKeys.stock.all() }),
      queryClient.invalidateQueries({ queryKey: tiQueryKeys.dashboard() }),
      id
        ? queryClient.invalidateQueries({ queryKey: tiQueryKeys.stock.item(id) })
        : Promise.resolve(),
    ]);
  };
}

export function useTiStockItems(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockItem[], Error> {
  return useFetch(
    tiQueryKeys.stock.items(filters),
    () => tiStockService.listStockItems(filters),
    options,
  );
}

export function useTiStockItem(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockItem, Error> {
  return useFetch(tiQueryKeys.stock.item(id), () => tiStockService.getStockItemById(id as TiId), {
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
    () => tiStockService.listStockCategories(filters),
    options,
  );
}

export function useTiStockLocations(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiStockLocation[], Error> {
  return useFetch(
    tiQueryKeys.stock.locations(filters),
    () => tiStockService.listStockLocations(filters),
    options,
  );
}

export function useCreateTiStockItemMutation(): UseMutationResult<
  TiStockItem,
  Error,
  TiStockItemCreatePayload
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: (payload) => tiStockService.createStockItem(payload),
    onSuccess: async () => {
      await invalidateTiStockCaches();
    },
  });
}

export function useUpdateTiStockItemMutation(): UseMutationResult<
  TiStockItem,
  Error,
  TiStockItemMutationVariables
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: ({ id, payload }) => tiStockService.updateStockItem(id, payload),
    onSuccess: async (_item, variables) => {
      await invalidateTiStockCaches(variables.id);
    },
  });
}

export function useCreateTiStockEntryMutation(): UseMutationResult<
  TiStockItem,
  Error,
  TiStockMovementMutationVariables<TiStockEntryPayload>
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: ({ id, payload }) => tiStockService.createStockEntry(id, payload),
    onSuccess: async (_item, variables) => {
      await invalidateTiStockCaches(variables.id);
    },
  });
}

export function useCreateTiStockExitMutation(): UseMutationResult<
  TiStockItem,
  Error,
  TiStockMovementMutationVariables<TiStockExitPayload>
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: ({ id, payload }) => tiStockService.createStockExit(id, payload),
    onSuccess: async (_item, variables) => {
      await invalidateTiStockCaches(variables.id);
    },
  });
}

export function useCreateTiStockCategoryMutation(): UseMutationResult<
  TiStockCategory,
  Error,
  TiStockCategoryCreatePayload
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: (payload) => tiStockService.createStockCategory(payload),
    onSuccess: async () => {
      await invalidateTiStockCaches();
    },
  });
}

export function useUpdateTiStockCategoryMutation(): UseMutationResult<
  TiStockCategory,
  Error,
  TiStockCategoryMutationVariables
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: ({ id, payload }) => tiStockService.updateStockCategory(id, payload),
    onSuccess: async () => {
      await invalidateTiStockCaches();
    },
  });
}

export function useCreateTiStockLocationMutation(): UseMutationResult<
  TiStockLocation,
  Error,
  TiStockLocationCreatePayload
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: (payload) => tiStockService.createStockLocation(payload),
    onSuccess: async () => {
      await invalidateTiStockCaches();
    },
  });
}

export function useUpdateTiStockLocationMutation(): UseMutationResult<
  TiStockLocation,
  Error,
  TiStockLocationMutationVariables
> {
  const invalidateTiStockCaches = useInvalidateTiStockCaches();

  return useMutation({
    mutationFn: ({ id, payload }) => tiStockService.updateStockLocation(id, payload),
    onSuccess: async () => {
      await invalidateTiStockCaches();
    },
  });
}

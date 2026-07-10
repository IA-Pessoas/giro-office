import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiInventoryService } from "../services";
import type {
  TiId,
  TiInventoryAsset,
  TiInventoryAssignUserPayload,
  TiInventoryCategory,
  TiInventoryCategoryPayload,
  TiInventoryLocation,
  TiInventoryLocationPayload,
  TiInventoryPayload,
  TiInventoryReturnPayload,
  TiListFilters,
  TiReadQueryOptions,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiInventoryAssetUpdateVariables = {
  id: TiId;
  payload: TiInventoryPayload;
};

type TiInventoryAssignUserVariables = {
  id: TiId;
  payload: TiInventoryAssignUserPayload;
};

type TiInventoryReturnVariables = {
  id: TiId;
  payload?: TiInventoryReturnPayload;
};

type TiInventoryCategoryUpdateVariables = {
  id: TiId;
  payload: TiInventoryCategoryPayload;
};

type TiInventoryLocationUpdateVariables = {
  id: TiId;
  payload: TiInventoryLocationPayload;
};

async function invalidateTiInventoryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.inventory.all() }),
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.dashboard() }),
  ]);
}

export function useTiInventory(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryAsset[], Error> {
  return useFetch(
    tiQueryKeys.inventory.list(filters),
    () => tiInventoryService.listInventory(filters),
    options,
  );
}

export function useTiInventoryAsset(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryAsset, Error> {
  return useFetch(
    tiQueryKeys.inventory.detail(id),
    () => tiInventoryService.getInventoryAssetById(id as TiId),
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
    () => tiInventoryService.listInventoryCategories(filters),
    options,
  );
}

export function useTiInventoryLocations(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiInventoryLocation[], Error> {
  return useFetch(
    tiQueryKeys.inventory.locations(filters),
    () => tiInventoryService.listInventoryLocations(filters),
    options,
  );
}

export function useCreateTiInventoryAssetMutation(): UseMutationResult<
  TiInventoryAsset,
  Error,
  TiInventoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiInventoryService.createInventoryAsset(payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useUpdateTiInventoryAssetMutation(): UseMutationResult<
  TiInventoryAsset,
  Error,
  TiInventoryAssetUpdateVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiInventoryService.updateInventoryAsset(id, payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useAssignTiInventoryAssetUserMutation(): UseMutationResult<
  TiInventoryAsset,
  Error,
  TiInventoryAssignUserVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiInventoryService.assignInventoryAssetUser(id, payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useReturnTiInventoryAssetMutation(): UseMutationResult<
  TiInventoryAsset,
  Error,
  TiInventoryReturnVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiInventoryService.returnInventoryAsset(id, payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useCreateTiInventoryCategoryMutation(): UseMutationResult<
  TiInventoryCategory,
  Error,
  TiInventoryCategoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiInventoryService.createInventoryCategory(payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useUpdateTiInventoryCategoryMutation(): UseMutationResult<
  TiInventoryCategory,
  Error,
  TiInventoryCategoryUpdateVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiInventoryService.updateInventoryCategory(id, payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useCreateTiInventoryLocationMutation(): UseMutationResult<
  TiInventoryLocation,
  Error,
  TiInventoryLocationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiInventoryService.createInventoryLocation(payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

export function useUpdateTiInventoryLocationMutation(): UseMutationResult<
  TiInventoryLocation,
  Error,
  TiInventoryLocationUpdateVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiInventoryService.updateInventoryLocation(id, payload),
    onSuccess: () => invalidateTiInventoryQueries(queryClient),
  });
}

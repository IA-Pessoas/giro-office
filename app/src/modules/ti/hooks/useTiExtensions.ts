import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiExtensionsService } from "../services";
import type {
  TiExtension,
  TiExtensionCreatePayload,
  TiExtensionUpdatePayload,
  TiId,
  TiListFilters,
  TiReadQueryOptions,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiExtensionMutationVariables = {
  id: TiId;
  payload: TiExtensionUpdatePayload;
};

export function useTiExtensions(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiExtension[], Error> {
  return useFetch(
    tiQueryKeys.extensions.list(filters),
    () => tiExtensionsService.listExtensions(filters),
    options,
  );
}

export function useTiExtension(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiExtension, Error> {
  return useFetch(
    tiQueryKeys.extensions.detail(id),
    () => tiExtensionsService.getExtensionById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useCreateTiExtensionMutation(): UseMutationResult<
  TiExtension,
  Error,
  TiExtensionCreatePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiExtensionsService.createExtension(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tiQueryKeys.extensions.all() });
    },
  });
}

export function useUpdateTiExtensionMutation(): UseMutationResult<
  TiExtension,
  Error,
  TiExtensionMutationVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiExtensionsService.updateExtension(id, payload),
    onSuccess: async (_extension, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tiQueryKeys.extensions.all() }),
        queryClient.invalidateQueries({ queryKey: tiQueryKeys.extensions.detail(variables.id) }),
      ]);
    },
  });
}

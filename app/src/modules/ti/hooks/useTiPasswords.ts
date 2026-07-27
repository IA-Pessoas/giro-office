import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiPasswordsService } from "../services";
import type {
  TiId,
  TiListResponse,
  TiPasswordCreatePayload,
  TiPasswordDeactivatePayload,
  TiPasswordDetail,
  TiPasswordListFilters,
  TiPasswordListItem,
  TiPasswordUpdatePayload,
  TiReadQueryOptions,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiPasswordMutationVariables = {
  id: TiId;
  payload: TiPasswordUpdatePayload;
};

export type TiPasswordDeactivateVariables = {
  id: TiId;
  payload: TiPasswordDeactivatePayload;
};

export function useTiPasswords(
  filters?: TiPasswordListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiListResponse<TiPasswordListItem>, Error> {
  return useFetch(
    tiQueryKeys.passwords.list(filters),
    () => tiPasswordsService.listPasswords(filters),
    options,
  );
}

export function useTiPassword(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiPasswordDetail, Error> {
  return useTiPasswordReveal(id, Boolean(id) && options?.enabled !== false, options);
}

export function useTiPasswordReveal(
  id?: TiId,
  canReveal = false,
  options?: TiReadQueryOptions,
): UseQueryResult<TiPasswordDetail, Error> {
  return useFetch(
    tiQueryKeys.passwords.detail(id),
    () => tiPasswordsService.getPasswordById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && Boolean(canReveal) && options?.enabled !== false,
    },
  );
}

export function useClearTiPasswordRevealCache(): (id?: TiId | null) => void {
  const queryClient = useQueryClient();

  return (id) => {
    if (!id) {
      return;
    }

    queryClient.removeQueries({ queryKey: tiQueryKeys.passwords.detail(id), exact: true });
  };
}

export function useCreateTiPasswordMutation(): UseMutationResult<
  TiPasswordListItem,
  Error,
  TiPasswordCreatePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiPasswordsService.createPassword(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tiQueryKeys.passwords.all() });
    },
  });
}

export function useUpdateTiPasswordMutation(): UseMutationResult<
  TiPasswordListItem,
  Error,
  TiPasswordMutationVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiPasswordsService.updatePassword(id, payload),
    onSuccess: async (_password, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tiQueryKeys.passwords.all() }),
        queryClient.invalidateQueries({ queryKey: tiQueryKeys.passwords.detail(variables.id) }),
      ]);
    },
  });
}

export function useDeactivateTiPasswordMutation(): UseMutationResult<
  TiPasswordListItem,
  Error,
  TiPasswordDeactivateVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiPasswordsService.deactivatePassword(id, payload),
    onSuccess: async (_password, variables) => {
      queryClient.removeQueries({
        queryKey: tiQueryKeys.passwords.detail(variables.id),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: tiQueryKeys.passwords.all() });
    },
  });
}

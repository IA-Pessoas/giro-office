import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiTermsService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiTerm,
  TiTermPayload,
  TiTermSignPayload,
  TiTermUpdatePayload,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiTermUpdateVariables = {
  id: TiId;
  payload: TiTermUpdatePayload;
};

type TiTermSignVariables = {
  id: TiId;
  payload?: TiTermSignPayload;
};

async function invalidateTiTermsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.terms.all() }),
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.inventory.all() }),
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.dashboard() }),
  ]);
}

export function useTiTerms(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiTerm[], Error> {
  return useFetch(tiQueryKeys.terms.list(filters), () => tiTermsService.listTerms(filters), options);
}

export function useTiTerm(id?: TiId, options?: TiReadQueryOptions): UseQueryResult<TiTerm, Error> {
  return useFetch(tiQueryKeys.terms.detail(id), () => tiTermsService.getTermById(id as TiId), {
    ...options,
    enabled: Boolean(id) && options?.enabled !== false,
  });
}

export function useCreateTiTermMutation(): UseMutationResult<TiTerm, Error, TiTermPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiTermsService.createTerm(payload),
    onSuccess: () => invalidateTiTermsQueries(queryClient),
  });
}

export function useUpdateTiTermMutation(): UseMutationResult<TiTerm, Error, TiTermUpdateVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiTermsService.updateTerm(id, payload),
    onSuccess: () => invalidateTiTermsQueries(queryClient),
  });
}

export function useSignTiTermMutation(): UseMutationResult<TiTerm, Error, TiTermSignVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiTermsService.signTerm(id, payload),
    onSuccess: () => invalidateTiTermsQueries(queryClient),
  });
}

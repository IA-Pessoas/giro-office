import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { contabilResponsibleService } from "../services";
import type {
  ContabilResponsible,
  CreateContabilResponsiblePayload,
  UpdateContabilResponsiblePayload,
} from "../types";
import { syncContabilResponsibleQueryCache } from "./contabilQueryCache";
import { contabilResponsibleQueryKey } from "./queryKeys";

export interface UpdateContabilResponsibleMutationPayload {
  responsibleId: string;
  clientId: string;
  payload: UpdateContabilResponsiblePayload;
}

export interface DeleteContabilResponsibleMutationPayload {
  responsibleId: string;
  clientId: string;
}

export function useContabilResponsible(
  clientId: string,
  options?: { enabled?: boolean },
): UseQueryResult<ContabilResponsible | null, Error> {
  return useFetch(
    contabilResponsibleQueryKey(clientId),
    () => contabilResponsibleService.getResponsibleByClient(clientId),
    {
      enabled: (options?.enabled ?? true) && Boolean(clientId),
      refetchOnWindowFocus: false,
    },
  );
}

export function useCreateContabilResponsibleMutation(): UseMutationResult<
  ContabilResponsible,
  Error,
  CreateContabilResponsiblePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => contabilResponsibleService.createResponsible(payload),
    onSuccess: async (responsible, payload) => {
      syncContabilResponsibleQueryCache(queryClient, payload.client_id, responsible);
      await queryClient.invalidateQueries({
        queryKey: contabilResponsibleQueryKey(payload.client_id),
      });
    },
  });
}

export function useUpdateContabilResponsibleMutation(): UseMutationResult<
  ContabilResponsible,
  Error,
  UpdateContabilResponsibleMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ responsibleId, payload }) =>
      contabilResponsibleService.updateResponsible(responsibleId, payload),
    onSuccess: async (responsible, variables) => {
      syncContabilResponsibleQueryCache(queryClient, variables.clientId, responsible);
      await queryClient.invalidateQueries({
        queryKey: contabilResponsibleQueryKey(variables.clientId),
      });
    },
  });
}

export function useDeleteContabilResponsibleMutation(): UseMutationResult<
  void,
  Error,
  DeleteContabilResponsibleMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ responsibleId }) =>
      contabilResponsibleService.deleteResponsible(responsibleId),
    onSuccess: async (_, variables) => {
      syncContabilResponsibleQueryCache(queryClient, variables.clientId, null);
      await queryClient.invalidateQueries({
        queryKey: contabilResponsibleQueryKey(variables.clientId),
      });
    },
  });
}

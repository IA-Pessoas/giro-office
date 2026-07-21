import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { contabilRelationshipService } from "../services";
import type {
  ContabilRelationship,
  CreateContabilRelationshipPayload,
  UpdateContabilRelationshipPayload,
} from "../types";
import { syncContabilRelationshipQueryCache } from "./contabilQueryCache";
import { contabilRelationshipQueryKey } from "./queryKeys";

export interface UpdateContabilRelationshipMutationPayload {
  relationshipId: string;
  clientId: string;
  payload: UpdateContabilRelationshipPayload;
}

export interface DeleteContabilRelationshipMutationPayload {
  relationshipId: string;
  clientId: string;
}

export function useContabilRelationship(
  clientId: string,
  options?: { enabled?: boolean },
): UseQueryResult<ContabilRelationship | null, Error> {
  return useFetch(
    contabilRelationshipQueryKey(clientId),
    () => contabilRelationshipService.getRelationshipByClient(clientId),
    {
      enabled: (options?.enabled ?? true) && Boolean(clientId),
    },
  );
}

export function useCreateContabilRelationshipMutation(): UseMutationResult<
  ContabilRelationship,
  Error,
  CreateContabilRelationshipPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => contabilRelationshipService.createRelationship(payload),
    onSuccess: async (relationship, payload) => {
      syncContabilRelationshipQueryCache(queryClient, payload.client_id, relationship);
      await queryClient.invalidateQueries({
        queryKey: contabilRelationshipQueryKey(payload.client_id),
      });
    },
  });
}

export function useUpdateContabilRelationshipMutation(): UseMutationResult<
  ContabilRelationship,
  Error,
  UpdateContabilRelationshipMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ relationshipId, payload }) =>
      contabilRelationshipService.updateRelationship(relationshipId, payload),
    onSuccess: async (relationship, variables) => {
      syncContabilRelationshipQueryCache(queryClient, variables.clientId, relationship);
      await queryClient.invalidateQueries({
        queryKey: contabilRelationshipQueryKey(variables.clientId),
      });
    },
  });
}

export function useDeleteContabilRelationshipMutation(): UseMutationResult<
  void,
  Error,
  DeleteContabilRelationshipMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ relationshipId }) =>
      contabilRelationshipService.deleteRelationship(relationshipId),
    onSuccess: async (_, variables) => {
      syncContabilRelationshipQueryCache(queryClient, variables.clientId, null);
      await queryClient.invalidateQueries({
        queryKey: contabilRelationshipQueryKey(variables.clientId),
      });
    },
  });
}

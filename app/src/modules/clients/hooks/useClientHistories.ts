import { useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { clientService } from "../services/clientService";
import type { ClientHistoryItem, CreateClientHistoryPayload, UpdateClientHistoryPayload } from "../types";

export function clientHistoriesQueryKey(clientId: string) {
  return ["clients", clientId, "histories"] as const;
}

export function useClientHistories(clientId: string | undefined): UseQueryResult<ClientHistoryItem[], Error> {
  return useFetch(clientHistoriesQueryKey(clientId ?? "missing"), () => clientService.listHistories(clientId ?? ""), {
    enabled: Boolean(clientId),
  });
}

export function useCreateClientHistoryMutation(
  clientId: string,
): UseMutationResult<ClientHistoryItem, Error, CreateClientHistoryPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.createHistory(clientId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientHistoriesQueryKey(clientId) });
    },
  });
}

export function useUpdateClientHistoryMutation(
  clientId: string,
  historyId: string,
): UseMutationResult<ClientHistoryItem, Error, UpdateClientHistoryPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updateHistory(clientId, historyId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientHistoriesQueryKey(clientId) });
    },
  });
}


export function useDeleteClientHistoryMutation(
  clientId: string,
): UseMutationResult<{ ok: boolean }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (historyId) => clientService.deleteHistory(clientId, historyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientHistoriesQueryKey(clientId) });
    },
  });
}

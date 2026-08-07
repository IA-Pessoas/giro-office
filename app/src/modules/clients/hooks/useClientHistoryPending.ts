import { useMutation, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { clientService } from "../services/clientService";
import type { ClientHistoryPendingItem, CreateClientHistoryPendingPayload } from "../types";

export function historyPendingQueryKey(userId: string | undefined) {
  return ["clients", "histories", "pending", { userId }] as const;
}

export function useHistoryPendingList(
  userId: string | undefined,
): UseQueryResult<ClientHistoryPendingItem[], Error> {
  return useFetch(
    historyPendingQueryKey(userId),
    () => clientService.listHistoryPending(userId ? { user_id: userId } : undefined),
  );
}

export function useCreateHistoryPendingMutation(
  clientId: string,
): UseMutationResult<ClientHistoryPendingItem, Error, CreateClientHistoryPendingPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.createHistoryPending(clientId, payload),
    onSuccess: async () => {
      // In PR6 we always refetch for consistency (no optimistic updates)
      await queryClient.invalidateQueries({ queryKey: ["clients", "histories", "pending"] });
    },
  });
}

export function useDeleteHistoryPendingMutation(): UseMutationResult<
  { ok: boolean },
  Error,
  { pendingId: string; userId: string | undefined }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pendingId }) => clientService.deleteHistoryPending(pendingId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: historyPendingQueryKey(variables.userId) });
    },
  });
}


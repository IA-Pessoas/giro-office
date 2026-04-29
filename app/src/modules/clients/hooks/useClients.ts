import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { clientService } from "../services/clientService";
import type {
  Client,
  ClientListFilters,
  ClientListPage,
  CreateClientPayload,
  UpdateClientPayload,
} from "../types";

export const CLIENTS_QUERY_KEY = ["clients"] as const;

export function clientListQueryKey(filters: ClientListFilters) {
  return [
    ...CLIENTS_QUERY_KEY,
    "list",
    filters.search ?? "",
    filters.status ?? "",
    filters.page ?? 1,
    filters.limit ?? 20,
  ] as const;
}

export function clientDetailQueryKey(id: string) {
  return [...CLIENTS_QUERY_KEY, "detail", id] as const;
}

export function useClients(filters: ClientListFilters): UseQueryResult<ClientListPage, Error> {
  return useFetch(clientListQueryKey(filters), () => clientService.list(filters), {
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
}

export function useClient(id: string | undefined): UseQueryResult<Client | null, Error> {
  return useFetch(clientDetailQueryKey(id ?? "missing"), () => clientService.getById(id ?? ""), {
    enabled: Boolean(id),
    refetchOnWindowFocus: false,
  });
}

export function useCreateClientMutation(): UseMutationResult<
  Client,
  Error,
  CreateClientPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientMutation(
  id: string,
): UseMutationResult<Client, Error, UpdateClientPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.update(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(id) }),
      ]);
    },
  });
}

export function useDeactivateClientMutation(id: string): UseMutationResult<Client, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientService.deactivate(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(id) }),
      ]);
    },
  });
}

export function useActivateClientMutation(id: string): UseMutationResult<Client, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientService.activate(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(id) }),
      ]);
    },
  });
}

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
  ClientCommercialRecord,
  ClientFinanceRecord,
  ClientPa,
  ClientPaResponse,
  ClientTerminationRecord,
  ClientListFilters,
  ClientListPage,
  CreateClientPayload,
  CreateClientIntegrationPayload,
  TerminateClientPayload,
  UpdateClientCommercialPayload,
  UpdateClientFinancePayload,
  UpdateClientPaPayload,
  UpdateClientIntegrationPayload,
  UpdateClientRegularizePayload,
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

export function clientPaDetailQueryKey(id: string) {
  return [...CLIENTS_QUERY_KEY, "detail", id, "pa"] as const;
}

export function useClients(filters: ClientListFilters): UseQueryResult<ClientListPage, Error> {
  return useFetch(clientListQueryKey(filters), () => clientService.list(filters), {
    placeholderData: (previousData) => previousData,
  });
}

export function useClient(id: string | undefined): UseQueryResult<Client | null, Error> {
  return useFetch(clientDetailQueryKey(id ?? "missing"), () => clientService.getById(id ?? ""), {
    enabled: Boolean(id),
  });
}

export function useClientPa(id: string | undefined): UseQueryResult<ClientPaResponse | null, Error> {
  return useFetch(clientPaDetailQueryKey(id ?? "missing"), () => clientService.getPaByClientId(id ?? ""), {
    enabled: Boolean(id),
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
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useCreateClientIntegrationMutation(): UseMutationResult<
  Client,
  Error,
  CreateClientIntegrationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.createIntegration(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientIntegrationMutation(
  id: string,
): UseMutationResult<Client, Error, UpdateClientIntegrationPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updateIntegration(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientCommercialMutation(
  id: string,
): UseMutationResult<ClientCommercialRecord, Error, UpdateClientCommercialPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updateCommercial(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientFinanceMutation(
  id: string,
): UseMutationResult<ClientFinanceRecord, Error, UpdateClientFinancePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updateFinance(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientRegularizeMutation(
  id: string,
): UseMutationResult<Client, Error, UpdateClientRegularizePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updateRegularize(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useTerminateClientMutation(
  id: string,
): UseMutationResult<ClientTerminationRecord, Error, TerminateClientPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.terminate(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useDeactivateClientMutation(id: string): UseMutationResult<Client, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientService.deactivate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useActivateClientMutation(id: string): UseMutationResult<Client, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientService.activate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useCreateClientPaMutation(id: string): UseMutationResult<ClientPa, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientService.createPa(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

export function useUpdateClientPaMutation(
  id: string,
): UseMutationResult<ClientPa, Error, UpdateClientPaPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => clientService.updatePa(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    },
  });
}

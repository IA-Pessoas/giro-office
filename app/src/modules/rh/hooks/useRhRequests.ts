import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { rhRequestsService } from "../services/rhRequestsService";
import type {
  CreateRhCategoryPayload,
  CreateRhMessagePayload,
  CreateRhMessageInput,
  CreateRhRequestPayload,
  DeleteRhCategoryPayload,
  DeleteRhRequestPayload,
  RhCategory,
  RhCategoryListFilters,
  RhMessage,
  RhMessageListFilters,
  RhMutationMessage,
  RhRequest,
  RhRequestListFilters,
  RhRequestListPage,
  RhRequestStatus,
  RhNotification,
  UpdateRhCategoryPayload,
  UpdateRhRequestPayload,
} from "../types";

export const RH_QUERY_KEY = ["rh"] as const;

interface RhRequestsReadQueryOptions {
  enabled?: boolean;
}

export function rhCategoriesQueryKey(filters: RhCategoryListFilters = {}) {
  return [...RH_QUERY_KEY, "categories", filters.activeOnly ?? false] as const;
}

export function rhRequestsQueryKey(filters: RhRequestListFilters = {}) {
  return [
    ...RH_QUERY_KEY,
    "requests",
    filters.status ?? "",
    filters.category_id ?? "",
    filters.requester_user_id ?? "",
    filters.assigned_to_user_id ?? "",
    filters.page ?? "",
    filters.limit ?? "",
  ] as const;
}

export function rhRequestDetailQueryKey(id: string) {
  return [...RH_QUERY_KEY, "requests", "detail", id] as const;
}

export function rhMessagesQueryKey(filters: RhMessageListFilters) {
  return [...RH_QUERY_KEY, "messages", filters.requestId] as const;
}

export const rhNotificationsQueryKey = [...RH_QUERY_KEY, "notifications"] as const;

export function useRhCategories(
  filters: RhCategoryListFilters = {},
): UseQueryResult<RhCategory[], Error> {
  return useFetch(rhCategoriesQueryKey(filters), () => rhRequestsService.listCategories(filters), {
  });
}

export function useRhRequests(
  filters: RhRequestListFilters = {},
  options?: RhRequestsReadQueryOptions,
): UseQueryResult<RhRequestListPage, Error> {
  return useFetch(rhRequestsQueryKey(filters), () => rhRequestsService.listRequests(filters), {
    enabled: options?.enabled ?? true,
  });
}

/** Pendente: aguarda ação do RH. Concluída: tem solução (Resolvido) ou foi aceita (Fechado). */
export const RH_PENDING_REQUEST_STATUSES = ["New", "In_Progress"] as const;
export const RH_FINISHED_REQUEST_STATUSES = ["Resolved", "Closed"] as const;

/** Soma o `total` do backend por status, e não os itens da página carregada. */
export function useRhRequestsTotal(
  statuses: readonly [RhRequestStatus, RhRequestStatus],
  options?: RhRequestsReadQueryOptions,
) {
  const first = useRhRequests({ status: statuses[0], limit: 1 }, options);
  const second = useRhRequests({ status: statuses[1], limit: 1 }, options);
  return {
    total: (first.data?.total ?? 0) + (second.data?.total ?? 0),
    isLoading: first.isLoading || second.isLoading,
  };
}

export function useRhRequest(id: string | undefined): UseQueryResult<RhRequest, Error> {
  return useFetch(
    rhRequestDetailQueryKey(id ?? "missing"),
    () => rhRequestsService.getRequestById(id ?? ""),
    {
      enabled: Boolean(id),
    },
  );
}

export function useRhMessages(
  filters: RhMessageListFilters | undefined,
): UseQueryResult<RhMessage[], Error> {
  const requestId = filters?.requestId ?? "missing";

  return useFetch(
    rhMessagesQueryKey({ requestId }),
    () => rhRequestsService.listMessages({ requestId }),
    {
      enabled: Boolean(filters?.requestId),
    },
  );
}

export function useRhNotifications(options?: { enabled?: boolean }): UseQueryResult<RhNotification[], Error> {
  return useFetch(rhNotificationsQueryKey, () => rhRequestsService.listNotifications(), {
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
  });
}

export function useCreateRhCategoryMutation(): UseMutationResult<
  RhCategory,
  Error,
  CreateRhCategoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.createCategory(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useUpdateRhCategoryMutation(): UseMutationResult<
  RhCategory,
  Error,
  UpdateRhCategoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.updateCategory(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useDeleteRhCategoryMutation(): UseMutationResult<
  RhMutationMessage,
  Error,
  DeleteRhCategoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.deleteCategory(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useCreateRhRequestMutation(): UseMutationResult<
  RhRequest,
  Error,
  CreateRhRequestPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.createRequest(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useUpdateRhRequestMutation(): UseMutationResult<
  RhRequest,
  Error,
  UpdateRhRequestPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.updateRequest(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useDeleteRhRequestMutation(): UseMutationResult<
  RhMutationMessage,
  Error,
  DeleteRhRequestPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.deleteRequest(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useCreateRhMessageMutation(): UseMutationResult<
  RhMessage,
  Error,
  CreateRhMessageInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) => rhRequestsService.createMessageWithAttachment(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

export function useMarkRhNotificationReadMutation(): UseMutationResult<
  { count: number },
  Error,
  { id?: string; request_id?: string; all?: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => rhRequestsService.markNotificationRead(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rhNotificationsQueryKey });
    },
  });
}

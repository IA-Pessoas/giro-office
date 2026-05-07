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
  UpdateRhCategoryPayload,
  UpdateRhRequestPayload,
} from "../types";

export const RH_QUERY_KEY = ["rh"] as const;

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
  ] as const;
}

export function rhRequestDetailQueryKey(id: string) {
  return [...RH_QUERY_KEY, "requests", "detail", id] as const;
}

export function rhMessagesQueryKey(filters: RhMessageListFilters) {
  return [...RH_QUERY_KEY, "messages", filters.requestId] as const;
}

export function useRhCategories(
  filters: RhCategoryListFilters = {},
): UseQueryResult<RhCategory[], Error> {
  return useFetch(rhCategoriesQueryKey(filters), () => rhRequestsService.listCategories(filters), {
    refetchOnWindowFocus: false,
  });
}

export function useRhRequests(
  filters: RhRequestListFilters = {},
): UseQueryResult<RhRequest[], Error> {
  return useFetch(rhRequestsQueryKey(filters), () => rhRequestsService.listRequests(filters), {
    refetchOnWindowFocus: false,
  });
}

export function useRhRequest(id: string | undefined): UseQueryResult<RhRequest, Error> {
  return useFetch(
    rhRequestDetailQueryKey(id ?? "missing"),
    () => rhRequestsService.getRequestById(id ?? ""),
    {
      enabled: Boolean(id),
      refetchOnWindowFocus: false,
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
      refetchOnWindowFocus: false,
    },
  );
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
  CreateRhMessagePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => rhRequestsService.createMessage(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RH_QUERY_KEY });
    },
  });
}

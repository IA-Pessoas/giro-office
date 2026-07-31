import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { tiRequestsService } from "../services";
import type {
  TiId,
  TiListFilters,
  TiReadQueryOptions,
  TiRequest,
  TiRequestAssignPayload,
  TiTransferCandidate,
  TiRequestCategory,
  TiRequestCategoryPayload,
  TiRequestMessage,
  TiRequestMessagePayload,
  TiRequestPayload,
  TiRequestStatusPayload,
} from "../types";
import { tiQueryKeys } from "./queryKeys";

type TiRequestMutationVariables = {
  id: TiId;
  payload: TiRequestPayload;
};

type TiRequestAssignVariables = {
  id: TiId;
  payload: TiRequestAssignPayload;
};

type TiRequestStatusVariables = {
  id: TiId;
  payload: TiRequestStatusPayload;
};

type TiRequestMessageVariables = {
  id: TiId;
  payload: TiRequestMessagePayload;
};

type TiRequestCategoryMutationVariables = {
  id: TiId;
  payload: TiRequestCategoryPayload;
};

function invalidateTiRequests(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.requests.all() }),
    queryClient.invalidateQueries({ queryKey: tiQueryKeys.dashboard() }),
  ]);
}

export function useTiRequests(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequest[], Error> {
  return useFetch(tiQueryKeys.requests.list(filters), () => tiRequestsService.list(filters), options);
}

export function useTiRequest(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequest, Error> {
  return useFetch(
    tiQueryKeys.requests.detail(id),
    () => tiRequestsService.getById(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRequestMessages(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequestMessage[], Error> {
  return useFetch(
    tiQueryKeys.requests.messages(id),
    () => tiRequestsService.listMessages(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRequestTransferCandidates(
  id?: TiId,
  options?: TiReadQueryOptions,
): UseQueryResult<TiTransferCandidate[], Error> {
  return useFetch(
    tiQueryKeys.requests.transferCandidates(id),
    () => tiRequestsService.listTransferCandidates(id as TiId),
    {
      ...options,
      enabled: Boolean(id) && options?.enabled !== false,
    },
  );
}

export function useTiRequestCategories(
  filters?: TiListFilters,
  options?: TiReadQueryOptions,
): UseQueryResult<TiRequestCategory[], Error> {
  return useFetch(
    tiQueryKeys.requests.categories(filters),
    () => tiRequestsService.listCategories(filters),
    options,
  );
}

export function useCreateTiRequest(): UseMutationResult<TiRequest, Error, TiRequestPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiRequestsService.create(payload),
    onSuccess: () => invalidateTiRequests(queryClient),
  });
}

export function useUpdateTiRequest(): UseMutationResult<
  TiRequest,
  Error,
  TiRequestMutationVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRequestsService.update(id, payload),
    onSuccess: (_request, variables) =>
      Promise.all([
        invalidateTiRequests(queryClient),
        queryClient.invalidateQueries({
          queryKey: tiQueryKeys.requests.detail(variables.id),
        }),
      ]),
  });
}

export function useAssignTiRequest(): UseMutationResult<
  TiRequest,
  Error,
  TiRequestAssignVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRequestsService.assign(id, payload),
    onSuccess: (_request, variables) =>
      Promise.all([
        invalidateTiRequests(queryClient),
        queryClient.invalidateQueries({
          queryKey: tiQueryKeys.requests.detail(variables.id),
        }),
      ]),
  });
}

export function useUpdateTiRequestStatus(): UseMutationResult<
  TiRequest,
  Error,
  TiRequestStatusVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRequestsService.updateStatus(id, payload),
    onSuccess: (_request, variables) =>
      Promise.all([
        invalidateTiRequests(queryClient),
        queryClient.invalidateQueries({
          queryKey: tiQueryKeys.requests.detail(variables.id),
        }),
      ]),
  });
}

export function useCreateTiRequestMessage(): UseMutationResult<
  TiRequestMessage,
  Error,
  TiRequestMessageVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRequestsService.createMessage(id, payload),
    onSuccess: (_message, variables) =>
      Promise.all([
        invalidateTiRequests(queryClient),
        queryClient.invalidateQueries({
          queryKey: tiQueryKeys.requests.messages(variables.id),
        }),
      ]),
  });
}

export function useCreateTiRequestCategory(): UseMutationResult<
  TiRequestCategory,
  Error,
  TiRequestCategoryPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => tiRequestsService.createCategory(payload),
    onSuccess: () => invalidateTiRequests(queryClient),
  });
}

export function useUpdateTiRequestCategory(): UseMutationResult<
  TiRequestCategory,
  Error,
  TiRequestCategoryMutationVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => tiRequestsService.updateCategory(id, payload),
    onSuccess: () => invalidateTiRequests(queryClient),
  });
}

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskCompletionDecision,
  IntegracaoTaskCompletionRequest,
  IntegracaoTaskDetail,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  UpdateIntegracaoTaskBody,
} from "../types";
import { integracaoTasksService } from "../services";
import {
  INTEGRACAO_TASKS_QUERY_KEY,
  integracaoTaskCompletionRequestsQueryKey,
  integracaoTaskDetailQueryKey,
  integracaoTasksListQueryKey,
} from "./queryKeys";

export function useIntegracaoTasksList(
  params: IntegracaoTaskListParams = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<IntegracaoTaskListResult, Error> {
  return useFetch(
    integracaoTasksListQueryKey(params),
    () => integracaoTasksService.list(params),
    {
      enabled: options.enabled ?? true,
    },
  );
}

export function useIntegracaoTaskDetail(taskId: string | undefined): UseQueryResult<IntegracaoTaskDetail, Error> {
  return useFetch(
    integracaoTaskDetailQueryKey(taskId ?? "missing"),
    () => integracaoTasksService.detail(taskId ?? ""),
    {
      enabled: Boolean(taskId),
    },
  );
}

export function useIntegracaoTaskCompletionRequests(
  taskId: string | undefined,
): UseQueryResult<IntegracaoTaskCompletionRequest[], Error> {
  return useFetch(
    integracaoTaskCompletionRequestsQueryKey(taskId ?? "missing"),
    () => integracaoTasksService.listCompletionRequests(taskId ?? ""),
    { enabled: Boolean(taskId) },
  );
}

async function invalidateTaskLifecycle(queryClient: ReturnType<typeof useQueryClient>, taskId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: integracaoTaskDetailQueryKey(taskId) }),
    queryClient.invalidateQueries({ queryKey: integracaoTaskCompletionRequestsQueryKey(taskId) }),
    queryClient.invalidateQueries({ queryKey: INTEGRACAO_TASKS_QUERY_KEY }),
  ]);
}

export function useRequestTaskCompletionMutation(): UseMutationResult<
  void,
  Error,
  { taskId: string; reason: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason }) => integracaoTasksService.requestCompletion(taskId, reason),
    onSuccess: async (_result, { taskId }) => invalidateTaskLifecycle(queryClient, taskId),
  });
}

export function useDecideTaskCompletionMutation(): UseMutationResult<
  void,
  Error,
  { taskId: string; requestId: string; decision: IntegracaoTaskCompletionDecision; reason?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, requestId, decision, reason }) =>
      integracaoTasksService.decideCompletion(taskId, requestId, decision, reason),
    onSuccess: async (_result, { taskId }) => invalidateTaskLifecycle(queryClient, taskId),
  });
}

export function useCancelTaskCompletionMutation(): UseMutationResult<
  void,
  Error,
  { taskId: string; requestId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, requestId }) => integracaoTasksService.cancelCompletion(taskId, requestId),
    onSuccess: async (_result, { taskId }) => invalidateTaskLifecycle(queryClient, taskId),
  });
}

export function useReopenTaskMutation(): UseMutationResult<
  void,
  Error,
  { taskId: string; reason: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason }) => integracaoTasksService.reopen(taskId, reason),
    onSuccess: async (_result, { taskId }) => invalidateTaskLifecycle(queryClient, taskId),
  });
}

export function useCreateIntegracaoTaskMutation(): UseMutationResult<
  IntegracaoTaskDetail,
  Error,
  CreateIntegracaoTaskBody
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => integracaoTasksService.create(payload),
    onSuccess: async (createdTask) => {
      queryClient.setQueryData(integracaoTaskDetailQueryKey(createdTask.id), createdTask);
      await queryClient.invalidateQueries({
        queryKey: INTEGRACAO_TASKS_QUERY_KEY,
      });
    },
  });
}

export function useUpdateIntegracaoTaskMutation(): UseMutationResult<
  IntegracaoTaskDetail,
  Error,
  UpdateIntegracaoTaskBody
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => integracaoTasksService.update(payload),
    onSuccess: async (updatedTask) => {
      queryClient.setQueryData(integracaoTaskDetailQueryKey(updatedTask.id), updatedTask);
      await queryClient.invalidateQueries({
        queryKey: INTEGRACAO_TASKS_QUERY_KEY,
      });
    },
  });
}

export function useDeleteIntegracaoTaskMutation(): UseMutationResult<
  void,
  Error,
  { taskId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId }) => integracaoTasksService.delete(taskId),
    onSuccess: async (_result, variables) => {
      queryClient.removeQueries({
        queryKey: integracaoTaskDetailQueryKey(variables.taskId),
      });
      await queryClient.invalidateQueries({
        queryKey: INTEGRACAO_TASKS_QUERY_KEY,
      });
    },
  });
}

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskDetail,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  UpdateIntegracaoTaskBody,
} from "../types";
import { integracaoTasksService } from "../services";
import {
  INTEGRACAO_TASKS_QUERY_KEY,
  integracaoTaskDetailQueryKey,
  integracaoTasksListQueryKey,
} from "./queryKeys";

export function useIntegracaoTasksList(
  params: IntegracaoTaskListParams = {},
): UseQueryResult<IntegracaoTaskListResult, Error> {
  return useFetch(
    integracaoTasksListQueryKey(params),
    () => integracaoTasksService.list(params),
    {
      enabled: true,
      placeholderData: (previousData) => previousData,
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

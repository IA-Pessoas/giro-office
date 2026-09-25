import { useEffect } from "react";
import { useQueryClient, type QueryObserverResult } from "@tanstack/react-query";
import { toast } from "@shared/services/toast";

import { useFetch } from "@shared/hooks";
import type { PaginatedResult } from "@shared/pagination/pagination";

import type {
  CreateTaskModelData,
  TaskModel,
  TaskModelListItem,
  TaskModelListParams,
  UpdateTaskModelData,
} from "../types";
import { taskModelsListQueryKey } from "./queryKeys";
import { taskModelService } from "../services/taskModelService";

function getApiErrorMessage(error: unknown, fallback: string): string {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: { error?: string; message?: string };
      };
    }
  ).response;

  // 4xx traz a mensagem de negócio; 5xx já ganhou o toast neutro com requestId (#1365).
  if (response?.status && response.status < 500) {
    return response.data?.error ?? response.data?.message ?? fallback;
  }

  return fallback;
}

interface UseTaskModelsResult {
  models: TaskModel[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  isLoading: boolean;
  createModel: (data: CreateTaskModelData) => Promise<boolean>;
  updateModel: (data: UpdateTaskModelData) => Promise<boolean>;
  deleteModel: (id: string) => Promise<boolean>;
  refresh: () => Promise<QueryObserverResult<PaginatedResult<TaskModelListItem>, Error>>;
  isError: boolean;
}

export const useTaskModels = (
  params: TaskModelListParams & { page: number; limit: number },
): UseTaskModelsResult => {
  const queryClient = useQueryClient();
  const taskModelsList = taskModelsListQueryKey(params);

  const taskModelsQuery = useFetch(taskModelsList, () => taskModelService.listPage(params), {
    enabled: true,
  });

  useEffect(() => {
    if (taskModelsQuery.isError) {
      toast.error("Erro ao buscar modelos.", {
        toastId: "task-models-list-error",
      });
    }
  }, [taskModelsQuery.isError]);

  const createModel = async (data: CreateTaskModelData): Promise<boolean> => {
    try {
      await taskModelService.create(data);
      toast.success("Modelo criado com sucesso!");
      await queryClient.invalidateQueries({
        queryKey: ["task-models"],
      });
      return true;
    } catch (error) {
      toast.error("Erro ao criar modelo.");
      return false;
    }
  };

  const updateModel = async (data: UpdateTaskModelData): Promise<boolean> => {
    try {
      await taskModelService.update(data);
      toast.success("Modelo atualizado!");
      await queryClient.invalidateQueries({
        queryKey: ["task-models"],
      });
      return true;
    } catch (error) {
      toast.error("Erro ao atualizar.");
      return false;
    }
  };

  const deleteModel = async (id: string): Promise<boolean> => {
    try {
      await taskModelService.delete(id);
      toast.success("Removido!");
      await queryClient.invalidateQueries({
        queryKey: ["task-models"],
      });
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Erro ao remover."));
      return false;
    }
  };

  return {
    models: taskModelsQuery.data?.data ?? [],
    total: taskModelsQuery.data?.total ?? 0,
    page: taskModelsQuery.data?.page ?? params.page,
    limit: taskModelsQuery.data?.limit ?? params.limit,
    hasMore: taskModelsQuery.data?.hasMore ?? false,
    isLoading: taskModelsQuery.isLoading,
    createModel,
    updateModel,
    deleteModel,
    refresh: taskModelsQuery.refetch,
    isError: taskModelsQuery.isError,
  };
};

export type { TaskModel } from "../types";

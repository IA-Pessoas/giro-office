import { useEffect } from "react";
import { useQueryClient, type QueryObserverResult } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { departmentService } from "@modules/departments";
import { useFetch } from "@shared/hooks";

import type {
  CreateTaskModelData,
  TaskModel,
  UpdateTaskModelData,
} from "../types";
import { taskModelsListQueryKey } from "./queryKeys";
import { taskModelService } from "../services/taskModelService";

interface UseTaskModelsResult {
  models: TaskModel[];
  isLoading: boolean;
  createModel: (data: CreateTaskModelData) => Promise<boolean>;
  updateModel: (data: UpdateTaskModelData) => Promise<boolean>;
  deleteModel: (id: string) => Promise<boolean>;
  refresh: () => Promise<QueryObserverResult<TaskModel[], Error>>;
}

function enrichTaskModelsWithDepartments(
  models: Array<Pick<TaskModel, "id" | "department_id" | "name">>,
  departments: Array<{ id: string; name: string }>,
): TaskModel[] {
  const departmentById = new Map(departments.map((department) => [department.id, department]));

  return models.map((model) => {
    const department = departmentById.get(model.department_id);

    return {
      ...model,
      ...(department
        ? {
            department: {
              id: department.id,
              name: department.name,
            },
          }
        : {}),
    };
  });
}

async function fetchTaskModels(): Promise<TaskModel[]> {
  const [list, departments] = await Promise.all([
    taskModelService.list(),
    departmentService.list({ status: "Ativo" }),
  ]);

  return enrichTaskModelsWithDepartments(list, departments);
}

export const useTaskModels = (): UseTaskModelsResult => {
  const queryClient = useQueryClient();
  const taskModelsList = taskModelsListQueryKey();

  const taskModelsQuery = useFetch(taskModelsList, fetchTaskModels, {
    enabled: true,
    refetchOnWindowFocus: false,
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
        queryKey: taskModelsList,
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
        queryKey: taskModelsList,
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
        queryKey: taskModelsList,
      });
      return true;
    } catch (error) {
      toast.error("Erro ao remover.");
      return false;
    }
  };

  return {
    models: taskModelsQuery.data ?? [],
    isLoading: taskModelsQuery.isLoading || taskModelsQuery.isRefetching,
    createModel,
    updateModel,
    deleteModel,
    refresh: taskModelsQuery.refetch,
  };
};

export type { TaskModel } from "../types";

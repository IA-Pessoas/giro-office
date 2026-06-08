import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import { departmentService } from "@modules/departments";

import { taskModelService } from "../services/taskModelService";
import type { CreateTaskModelData, TaskModel, UpdateTaskModelData } from "../types";

function enrichTaskModelsWithDepartments(
  models: TaskModel[],
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

export const useTaskModels = () => {
  const [models, setModels] = useState<TaskModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, departments] = await Promise.all([
        taskModelService.list(),
        departmentService.list({ status: "Ativo" }),
      ]);

      setModels(enrichTaskModelsWithDepartments(list, departments));
    } catch (error) {
      console.error(error);
      toast.error("Erro ao buscar modelos.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createModel = async (data: CreateTaskModelData) => {
    try {
      await taskModelService.create(data);
      toast.success("Modelo criado com sucesso!");
      await fetchModels();
      return true;
    } catch (error) {
      toast.error("Erro ao criar modelo.");
      return false;
    }
  };

  const updateModel = async (data: UpdateTaskModelData) => {
    try {
      await taskModelService.update(data);
      toast.success("Modelo atualizado!");
      await fetchModels();
      return true;
    } catch (error) {
      toast.error("Erro ao atualizar.");
      return false;
    }
  };

  const deleteModel = async (id: string) => {
    try {
      await taskModelService.delete(id);
      toast.success("Removido!");
      await fetchModels();
      return true;
    } catch (error) {
      toast.error("Erro ao remover.");
      return false;
    }
  };

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  return { models, isLoading, createModel, updateModel, deleteModel, refresh: fetchModels };
};

export type { TaskModel } from "../types";

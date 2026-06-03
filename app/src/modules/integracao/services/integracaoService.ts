import { setupAPIClient } from "@shared/services/api";

import type { CreateTaskModelData, TaskDependent, TaskModel, UpdateTaskModelData } from "../types";

export const integracaoService = {
  taskModels: {
    list: async (): Promise<TaskModel[]> => {
      const api = setupAPIClient();
      const response = await api.get("/task/models");
      return response.data;
    },

    create: async (data: CreateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.post("/task/models", data);
      return response.data;
    },

    update: async (data: UpdateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.put("/task/models", data);
      return response.data;
    },

    delete: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete("/task/model", { data: { task_id: id } });
    },

    getDependents: async (taskModelId: string): Promise<TaskDependent[]> => {
      const api = setupAPIClient();
      const response = await api.get("/task/models/dependent", {
        params: { task_model_id: taskModelId },
      });
      return response.data;
    },

    createDependent: async (data: {
      task_model_id: string;
      dependent_id: string;
      wait: boolean;
      observation: string;
    }): Promise<void> => {
      const api = setupAPIClient();
      await api.post("/task/models/dependent", data);
    },

    deleteDependent: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete("/task/model/dependent", { data: { id } });
    },
  },
};

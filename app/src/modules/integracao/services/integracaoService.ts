import { setupAPIClient } from '@shared/services/api';
import type { TaskModel, CreateTaskModelData, UpdateTaskModelData, Project, CreateProjectData, UpdateProjectData, TaskDependent } from '../types';

export const integracaoService = {
  taskModels: {
    list: async (): Promise<TaskModel[]> => {
      const api = setupAPIClient();
      const response = await api.get('/task/models');
      return response.data;
    },

    create: async (data: CreateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.post('/task/models', data);
      return response.data;
    },

    update: async (data: UpdateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.put('/task/models', data);
      return response.data;
    },

    delete: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/task/model', { data: { task_id: id } });
    },

    getDependents: async (taskModelId: string): Promise<TaskDependent[]> => {
      const api = setupAPIClient();
      const response = await api.get('/task/models/dependent', {
        params: { task_model_id: taskModelId }
      });
      return response.data;
    },

    createDependent: async (data: { task_model_id: string; dependent_id: string; wait: boolean; observation: string }): Promise<void> => {
      const api = setupAPIClient();
      await api.post('/task/models/dependent', data);
    },

    deleteDependent: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/task/model/dependent', { data: { id } });
    },
  },

  projects: {
    getByClient: async (clientId: string): Promise<Project | null> => {
      const api = setupAPIClient();
      try {
        const response = await api.get('/project/project', {
          params: { client_id: clientId }
        });
        return response.data;
      } catch (error) {
        return null;
      }
    },

    create: async (data: CreateProjectData): Promise<Project> => {
      const api = setupAPIClient();
      const response = await api.post('/project/projects', data);
      return response.data;
    },

    update: async (data: UpdateProjectData): Promise<Project> => {
      const api = setupAPIClient();
      const response = await api.put('/project/projects', data);
      return response.data;
    },
  },

  tasks: {
    create: async (data: { project_id: string; task_model_id: string; observation: string }): Promise<any> => {
      const api = setupAPIClient();
      const response = await api.post('/task/tasks', data);
      return response.data;
    },

    delete: async (taskId: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/task/task', { data: { task_id: taskId } });
    },
  },
};

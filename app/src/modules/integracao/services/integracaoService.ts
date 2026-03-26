import { setupAPIClient } from '@shared/services/api';
import type { TaskModel, CreateTaskModelData, UpdateTaskModelData, Project, CreateProjectData, UpdateProjectData, TaskDependent } from '../types';

export const integracaoService = {
  taskModels: {
    list: async (): Promise<TaskModel[]> => {
      const api = setupAPIClient();
      const response = await api.get('/integracao-tasksModel');
      return response.data;
    },

    create: async (data: CreateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.post('/integracao-tasksModel', data);
      return response.data;
    },

    update: async (data: UpdateTaskModelData): Promise<TaskModel> => {
      const api = setupAPIClient();
      const response = await api.put('/integracao-tasksModel', data);
      return response.data;
    },

    delete: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/integracao-taskModel', { data: { task_id: id } });
    },

    getDependents: async (taskModelId: string): Promise<TaskDependent[]> => {
      const api = setupAPIClient();
      const response = await api.get('/integracao-tasksModel-dependent', {
        params: { task_model_id: taskModelId }
      });
      return response.data;
    },

    createDependent: async (data: { task_model_id: string; dependent_id: string; wait: boolean; observation: string }): Promise<void> => {
      const api = setupAPIClient();
      await api.post('/integracao-tasksModel-dependent', data);
    },

    deleteDependent: async (id: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/integracao-taskModel-dependent', { data: { id } });
    },
  },

  projects: {
    getByClient: async (clientId: string): Promise<Project | null> => {
      const api = setupAPIClient();
      try {
        const response = await api.get('/integracao-project', {
          params: { client_id: clientId }
        });
        return response.data;
      } catch (error) {
        return null;
      }
    },

    create: async (data: CreateProjectData): Promise<Project> => {
      const api = setupAPIClient();
      const response = await api.post('/integracao-projects', data);
      return response.data;
    },

    update: async (data: UpdateProjectData): Promise<Project> => {
      const api = setupAPIClient();
      const response = await api.put('/integracao-projects', data);
      return response.data;
    },
  },

  tasks: {
    create: async (data: { project_id: string; task_model_id: string; observation: string }): Promise<any> => {
      const api = setupAPIClient();
      const response = await api.post('/integracao-tasks', data);
      return response.data;
    },

    delete: async (taskId: string): Promise<void> => {
      const api = setupAPIClient();
      await api.delete('/integracao-task', { data: { task_id: taskId } });
    },
  },
};

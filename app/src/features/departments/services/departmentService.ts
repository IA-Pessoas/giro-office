import { setupAPIClient } from '@shared/services/api';
import type { DepItem, CreateDepData, UpdateDepData } from '../types';

export const departmentService = {
  list: async (filters?: { status?: string }): Promise<DepItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/departments', { params: filters });
    return response.data;
  },

  getById: async (id: string): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.get('/department', {
      params: { dep_id: id },
    });
    return response.data.dep;
  },

  create: async (data: CreateDepData): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.post('/departments', data);
    return response.data.dep;
  },

  update: async (id: string, data: UpdateDepData): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.put('/departments', {
      dep_id: id,
      ...data,
    });
    return response.data;
  },
};

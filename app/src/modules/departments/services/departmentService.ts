import { setupAPIClient } from '@shared/services/api';
import type { DepItem, CreateDepData, UpdateDepData } from '../types';

function extractDepartmentList(payload: unknown): DepItem[] {
  if (Array.isArray(payload)) {
    return payload as DepItem[];
  }

  if (payload && typeof payload === 'object') {
    const nestedData = (payload as { data?: unknown }).data;
    if (Array.isArray(nestedData)) {
      return nestedData as DepItem[];
    }
  }

  return [];
}

function extractDepartment(payload: unknown): DepItem {
  if (payload && typeof payload === 'object') {
    const nestedData = (payload as { data?: unknown }).data;

    if (nestedData && typeof nestedData === 'object') {
      const nestedDepartment = (nestedData as { dep?: DepItem }).dep;

      if (nestedDepartment && typeof nestedDepartment === 'object') {
        return nestedDepartment;
      }

      return nestedData as DepItem;
    }

    const directDepartment = (payload as { dep?: DepItem }).dep;
    if (directDepartment && typeof directDepartment === 'object') {
      return directDepartment;
    }
  }

  throw new Error('Unexpected department payload shape.');
}

export const departmentService = {
  list: async (filters?: { status?: string }): Promise<DepItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/department/list', { params: filters });
    return extractDepartmentList(response.data);
  },

  getById: async (id: string): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.get('/department', {
      params: { dep_id: id },
    });
    return extractDepartment(response.data);
  },

  create: async (data: CreateDepData): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.post('/department', data);
    return extractDepartment(response.data);
  },

  update: async (id: string, data: UpdateDepData): Promise<DepItem> => {
    const api = setupAPIClient();
    const response = await api.put('/department', {
      dep_id: id,
      ...data,
    });
    return extractDepartment(response.data);
  },
};

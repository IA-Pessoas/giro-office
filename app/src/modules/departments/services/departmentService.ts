import { setupAPIClient } from '@shared/services/api';
import type { DepItem, CreateDepData, UpdateDepData } from '../types';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function extractDepartmentList(payload: unknown): DepItem[] {
  if (Array.isArray(payload)) {
    return payload as DepItem[];
  }

  if (isObject(payload)) {
    const nestedData = payload.data;
    if (Array.isArray(nestedData)) {
      return nestedData as DepItem[];
    }
  }

  throw new Error('Unexpected department list payload shape.');
}

function extractDepartment(payload: unknown): DepItem {
  if (!isObject(payload)) {
    throw new Error('Unexpected department payload shape.');
  }

  const data = payload.data;

  if (isObject(data)) {
    if (isObject(data.dep)) {
      return data.dep as unknown as DepItem;
    }

    return data as unknown as DepItem;
  }

  if (isObject(payload.dep)) {
    return payload.dep as unknown as DepItem;
  }

  throw new Error('Unexpected department payload shape.');
}

export const departmentService = {
  list: async (filters?: { status?: string }, ctx?: unknown): Promise<DepItem[]> => {
    const api = setupAPIClient(ctx);
    const response = await api.get('/department/list', { params: filters });
    return extractDepartmentList(response.data);
  },

  getById: async (id: string, ctx?: unknown): Promise<DepItem> => {
    const api = setupAPIClient(ctx);
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

import { setupAPIClient } from '@shared/services/api';
import type { Organization, OrganizationItem, CreateOrganizationData, UpdateOrganizationData } from '../types';

export const organizationService = {
  list: async (filters?: { status?: string }): Promise<OrganizationItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/organizations', { params: filters });
    return response.data;
  },

  getById: async (id: string): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.get('/organizations', {
      params: { id },
    });
    return response.data;
  },

  create: async (data: CreateOrganizationData): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.post('/organizations', data);
    return response.data;
  },

  update: async (id: string, data: UpdateOrganizationData): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.put('/organizations', {
      id,
      ...data,
    });
    return response.data;
  },
};

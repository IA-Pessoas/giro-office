import { setupAPIClient } from '@shared/services/api';
import type { Client, ClientItem, CreateClientData, UpdateClientData } from '../types';

export const clientService = {
  list: async (filters?: { status?: string; page?: number; limit?: number }): Promise<{ data: ClientItem[]; hasMore: boolean }> => {
    const api = setupAPIClient();
    const response = await api.get('/clients', { params: filters });
    return response.data;
  },

  getById: async (id: string): Promise<Client> => {
    const api = setupAPIClient();
    const response = await api.get('/client', { params: { client_id: id } });
    return response.data.client;
  },

  create: async (data: CreateClientData): Promise<ClientItem> => {
    const api = setupAPIClient();
    const cleanDoc = data.cpf_cnpj.replace(/[^\d]/g, '');
    const cleanCpfResp = (data.cpf_responsible || '').replace(/[^\d]/g, '');
    const cleanCpfAgent = (data.cpf_agent || '').replace(/[^\d]/g, '');
    
    const payload = {
      ...data,
      cpf_cnpj: cleanDoc,
      cpf_responsible: cleanCpfResp,
      cpf_agent: cleanCpfAgent,
      opening_date: data.opening_date ? new Date(data.opening_date) : null,
    };
    
    const response = await api.post('/clients-integracao', payload);
    return response.data.client;
  },

  update: async (id: string, data: UpdateClientData): Promise<Client> => {
    const api = setupAPIClient();
    const response = await api.put('/clients', { client_id: id, ...data });
    return response.data.client;
  },
};

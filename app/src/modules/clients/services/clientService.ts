import { setupAPIClient } from "@shared/services/api";
import type { Client, ClientItem, CreateClientData, UpdateClientData } from "../types";

function unwrapClient(body: unknown): ClientItem | undefined {
  if (body === null || typeof body !== "object") {
    return undefined;
  }
  const o = body as Record<string, unknown>;
  if ("client" in o && o.client !== null && typeof o.client === "object") {
    return o.client as ClientItem;
  }
  if ("data" in o && o.data !== null && typeof o.data === "object") {
    const d = o.data as Record<string, unknown>;
    if ("client" in d && d.client !== null && typeof d.client === "object") {
      return d.client as ClientItem;
    }
    return o.data as ClientItem;
  }
  return undefined;
}

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
    
    const response = await api.post("/clients-integracao", payload);
    const created = unwrapClient(response.data);
    if (!created) {
      throw new Error("Resposta inválida ao criar cliente.");
    }
    return created;
  },

  update: async (id: string, data: UpdateClientData): Promise<Client> => {
    const api = setupAPIClient();
    const response = await api.put('/clients', { client_id: id, ...data });
    return response.data.client;
  },
};

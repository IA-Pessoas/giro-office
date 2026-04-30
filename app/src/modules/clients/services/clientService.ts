import { setupAPIClient } from "@shared/services/api";

import type {
  Client,
  ClientPa,
  ClientPaResponse,
  ClientListFilters,
  ClientListPage,
  CreateClientPayload,
  CreateClientData,
  UpdateClientPaPayload,
  UpdateClientPayload,
  UpdateClientData,
} from "../types";
import {
  buildClientListParams,
  CLIENT_ENDPOINTS,
  unwrapClientEnvelope,
  unwrapClientPaDetail,
} from "./clientService.contract";

export const clientService = {
  async list(filters: ClientListFilters = {}): Promise<ClientListPage> {
    const api = setupAPIClient();
    const response = await api.get(CLIENT_ENDPOINTS.list, {
      params: buildClientListParams(filters),
    });

    return unwrapClientEnvelope<ClientListPage>(response.data);
  },

  async getById(id: string): Promise<Client | null> {
    const api = setupAPIClient();
    const response = await api.get(CLIENT_ENDPOINTS.detail(id));

    return unwrapClientEnvelope<Client | null>(response.data);
  },

  async create(payload: CreateClientPayload | CreateClientData): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.post(CLIENT_ENDPOINTS.create, payload);

    return unwrapClientEnvelope<Client>(response.data);
  },

  async update(id: string, payload: UpdateClientPayload | UpdateClientData): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.detail(id), payload);

    return unwrapClientEnvelope<Client>(response.data);
  },

  async deactivate(id: string): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.delete(CLIENT_ENDPOINTS.detail(id));

    return unwrapClientEnvelope<Client>(response.data);
  },

  async activate(id: string): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.post(CLIENT_ENDPOINTS.activate(id));

    return unwrapClientEnvelope<Client>(response.data);
  },

  async getPaByClientId(id: string): Promise<ClientPaResponse | null> {
    const api = setupAPIClient();
    const response = await api.get(CLIENT_ENDPOINTS.detailPa(id));

    return unwrapClientPaDetail(response.data) as ClientPaResponse | null;
  },

  async createPa(id: string): Promise<ClientPa> {
    const api = setupAPIClient();
    const response = await api.post(CLIENT_ENDPOINTS.createPa(id), {});

    return unwrapClientEnvelope<ClientPa>(response.data);
  },

  async updatePa(id: string, payload: UpdateClientPaPayload): Promise<ClientPa> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updatePa(id), payload);

    return unwrapClientEnvelope<ClientPa>(response.data);
  },
};

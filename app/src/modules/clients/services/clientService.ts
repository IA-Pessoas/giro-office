import { setupAPIClient } from "@shared/services/api";

import type {
  Client,
  ClientCommercialRecord,
  ClientFinanceRecord,
  ClientPa,
  ClientPaResponse,
  ClientListFilters,
  ClientListPage,
  CreateClientPayload,
  CreateClientData,
  CreateClientIntegrationPayload,
  ClientTerminationRecord,
  TerminateClientPayload,
  UpdateClientCommercialPayload,
  UpdateClientFinancePayload,
  UpdateClientPaPayload,
  UpdateClientPayload,
  UpdateClientIntegrationPayload,
  UpdateClientRegularizePayload,
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

  async createIntegration(payload: CreateClientIntegrationPayload): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.post(CLIENT_ENDPOINTS.createIntegration, payload);

    return unwrapClientEnvelope<Client>(response.data);
  },

  async updateIntegration(id: string, payload: UpdateClientIntegrationPayload): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateIntegration(id), payload);

    return unwrapClientEnvelope<Client>(response.data);
  },

  async updateCommercial(
    id: string,
    payload: UpdateClientCommercialPayload,
  ): Promise<ClientCommercialRecord> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateCommercial(id), payload);

    return unwrapClientEnvelope<ClientCommercialRecord>(response.data);
  },

  async updateFinance(
    id: string,
    payload: UpdateClientFinancePayload,
  ): Promise<ClientFinanceRecord> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateFinance(id), payload);

    return unwrapClientEnvelope<ClientFinanceRecord>(response.data);
  },

  async updateRegularize(id: string, payload: UpdateClientRegularizePayload): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateRegularize(id), payload);

    return unwrapClientEnvelope<Client>(response.data);
  },

  async terminate(id: string, payload: TerminateClientPayload): Promise<ClientTerminationRecord> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.terminate(id), payload);

    return unwrapClientEnvelope<ClientTerminationRecord>(response.data);
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

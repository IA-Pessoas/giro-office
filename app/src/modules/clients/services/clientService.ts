import { setupAPIClient } from "@shared/services/api";

import type {
  Client,
  ClientCompanyLookup,
  ClientFinanceRecord,
  ClientPa,
  ClientPaResponse,
  ClientHistoryItem,
  ClientHistoryPendingItem,
  ClientListFilters,
  ClientListPage,
  CreateClientPayload,
  CreateClientData,
  CreateClientIntegrationPayload,
  CreateClientHistoryPayload,
  CreateClientHistoryPendingPayload,
  ClientTerminationRecord,
  TerminateClientPayload,
  UpdateClientFinancePayload,
  UpdateClientHistoryPayload,
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
import { toHistoryIsoDate } from "../utils/historyDate";

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

  async lookupCnpj(cnpj: string): Promise<ClientCompanyLookup> {
    // Consulta opcional: a falha aparece no formulário, que continua salvando normalmente.
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.get(CLIENT_ENDPOINTS.lookupCnpj, { params: { cnpj } });

    return unwrapClientEnvelope<ClientCompanyLookup>(response.data);
  },

  async updateIntegration(id: string, payload: UpdateClientIntegrationPayload): Promise<Client> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateIntegration(id), payload);

    return unwrapClientEnvelope<Client>(response.data);
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

  async listHistories(clientId: string): Promise<ClientHistoryItem[]> {
    const api = setupAPIClient();
    const response = await api.get(CLIENT_ENDPOINTS.histories(clientId));

    const data = unwrapClientEnvelope<{ list?: ClientHistoryItem[] } | unknown>(response.data);
    if (data !== null && typeof data === "object" && "list" in data) {
      return ((data as { list?: ClientHistoryItem[] }).list ?? []) as ClientHistoryItem[];
    }

    return data as ClientHistoryItem[];
  },

  async createHistory(clientId: string, payload: CreateClientHistoryPayload): Promise<ClientHistoryItem> {
    const api = setupAPIClient();
    const formData = new FormData();
    formData.append("date", toHistoryIsoDate(payload.date));
    formData.append("history", payload.history);

    if (payload.pending_id) {
      formData.append("pending_id", payload.pending_id);
    }

    if (payload.file) {
      formData.append("file", payload.file);
    }

    const response = await api.post(CLIENT_ENDPOINTS.histories(clientId), formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return unwrapClientEnvelope<ClientHistoryItem>(response.data);
  },

  async updateHistory(
    clientId: string,
    historyId: string,
    payload: UpdateClientHistoryPayload,
  ): Promise<ClientHistoryItem> {
    const api = setupAPIClient();
    const response = await api.patch(CLIENT_ENDPOINTS.updateHistory(clientId, historyId), {
      ...payload,
      date: toHistoryIsoDate(payload.date),
    });

    return unwrapClientEnvelope<ClientHistoryItem>(response.data);
  },

  async createHistoryPending(
    clientId: string,
    payload: CreateClientHistoryPendingPayload,
  ): Promise<ClientHistoryPendingItem> {
    const api = setupAPIClient();
    const response = await api.post(CLIENT_ENDPOINTS.createHistoryPending(clientId), payload);

    return unwrapClientEnvelope<ClientHistoryPendingItem>(response.data);
  },

  async listHistoryPending(filter?: { user_id?: string }): Promise<ClientHistoryPendingItem[]> {
    const api = setupAPIClient();
    const response = await api.get(CLIENT_ENDPOINTS.listHistoryPending, { params: filter });

    const data = unwrapClientEnvelope<{ list?: ClientHistoryPendingItem[] } | unknown>(response.data);
    if (data !== null && typeof data === "object" && "list" in data) {
      return ((data as { list?: ClientHistoryPendingItem[] }).list ?? []) as ClientHistoryPendingItem[];
    }

    return data as ClientHistoryPendingItem[];
  },

  async deleteHistory(clientId: string, historyId: string): Promise<{ ok: boolean }> {
    const api = setupAPIClient();
    const response = await api.delete(CLIENT_ENDPOINTS.deleteHistory(clientId, historyId));

    return unwrapClientEnvelope<{ ok: boolean }>(response.data);
  },

  async deleteHistoryPending(pendingId: string): Promise<{ ok: boolean }> {
    const api = setupAPIClient();
    const response = await api.delete(CLIENT_ENDPOINTS.deleteHistoryPending(pendingId));

    return unwrapClientEnvelope<{ ok: boolean }>(response.data);
  },
};

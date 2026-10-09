import { setupAPIClient } from "@shared/services/api";
import type { PaginatedResult } from "@shared/pagination/pagination";

import type { FiscalMalhaStatus } from "../utils/fiscalMalha";
import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export interface FiscalMalha {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  reason: string;
  deadline: string | null;
  status: FiscalMalhaStatus;
  responsible_id: string | null;
  task_id: string | null;
  attachment: {
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
  } | null;
  created_by: string;
  updated_by: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalMalhaHistoryEntry {
  id: string;
  field: "deadline" | "status" | "responsible_id";
  previous_value: string | null;
  new_value: string | null;
  actor_user_id: string;
  created_at: string;
}

export interface FiscalMalhaPayload {
  period_start: string;
  period_end: string;
  reason: string;
  deadline: string | null;
  status: FiscalMalhaStatus;
  responsible_id: string | null;
  task_id: string | null;
}

export interface FiscalMalhaFilters {
  clientId: string;
  status?: FiscalMalhaStatus | "";
  responsibleId?: string;
  page: number;
}

export const MALHA_PAGE_SIZE = 20;

const api = () =>
  setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });

export const fiscalMalhaService = {
  async list(filters: FiscalMalhaFilters): Promise<PaginatedResult<FiscalMalha>> {
    const response = await api().get("/fiscal/malhas/list", {
      params: {
        client_id: filters.clientId,
        status: filters.status || undefined,
        responsible_id: filters.responsibleId || undefined,
        page: filters.page,
        page_size: MALHA_PAGE_SIZE,
      },
    });
    return unwrapFiscalEnvelope<PaginatedResult<FiscalMalha>>(response.data);
  },

  async detail(id: string): Promise<FiscalMalha & { history: FiscalMalhaHistoryEntry[] }> {
    const response = await api().get(`/fiscal/malhas/${id}`);
    return unwrapFiscalEnvelope(response.data);
  },

  async create(clientId: string, payload: FiscalMalhaPayload): Promise<FiscalMalha> {
    const response = await api().post("/fiscal/malhas", { client_id: clientId, ...payload });
    return unwrapFiscalEnvelope<FiscalMalha>(response.data);
  },

  async update(id: string, payload: FiscalMalhaPayload): Promise<FiscalMalha> {
    const response = await api().put(`/fiscal/malhas/${id}`, payload);
    return unwrapFiscalEnvelope<FiscalMalha>(response.data);
  },

  async uploadAttachment(id: string, file: File): Promise<FiscalMalha> {
    const form = new FormData();
    form.append("file", file);
    const response = await api().post(`/fiscal/malhas/${id}/attachment`, form);
    return unwrapFiscalEnvelope<FiscalMalha>(response.data);
  },

  async attachmentUrl(id: string): Promise<string> {
    const response = await api().get(`/fiscal/malhas/${id}/attachment`);
    return unwrapFiscalEnvelope<{ url: string }>(response.data).url;
  },
};

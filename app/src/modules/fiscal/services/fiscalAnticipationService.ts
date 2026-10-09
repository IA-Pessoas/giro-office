import { setupAPIClient } from "@shared/services/api";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { fileToBase64 } from "../utils/xmlSelection";
import type {
  FiscalAnticipationClassification,
  FiscalAnticipationCorrectableField,
  FiscalAnticipationIssueKind,
  FiscalAnticipationStatus,
} from "../utils/fiscalAnticipation";
import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export interface FiscalAnticipationBatch {
  id: string;
  client_id: string;
  competence: string;
  file_name: string;
  status: FiscalAnticipationStatus;
  responsible_id: string;
  reviewer_id: string | null;
  entry_count: number;
  note_count: number;
  item_count: number;
  issues: { entry: string; kind: FiscalAnticipationIssueKind; message: string }[];
  created_by: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalAnticipationItem {
  id: string;
  entry: string;
  access_key: string;
  issuer: string;
  model: string;
  series: string;
  note_number: string;
  item_number: number;
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  quantity: string | null;
  value: string | null;
  ipi: string | null;
  icms_st: string | null;
  classification: FiscalAnticipationClassification | null;
  manual_value: string | null;
  /** Correção por campo; o valor do XML continua no campo de mesmo nome. */
  corrections: Partial<Record<FiscalAnticipationCorrectableField, string>>;
}

export interface FiscalAnticipationHistoryEntry {
  id: string;
  item_id: string | null;
  field: string;
  previous_value: string | null;
  new_value: string | null;
  reason: string | null;
  actor_user_id: string;
  created_at: string;
}

export type FiscalAnticipationBatchDetail = FiscalAnticipationBatch & {
  items: FiscalAnticipationItem[];
  history?: FiscalAnticipationHistoryEntry[];
};

export type FiscalAnticipationItemChanges = {
  classification?: FiscalAnticipationClassification | null;
  manual_value?: string | null;
  corrections?: Partial<Record<FiscalAnticipationCorrectableField, string | null>>;
};

export const ANTICIPATION_PAGE_SIZE = 20;

const api = () =>
  setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });

export const fiscalAnticipationService = {
  async list(
    clientId: string,
    competence: string,
    page: number,
  ): Promise<PaginatedResult<FiscalAnticipationBatch>> {
    const response = await api().get("/fiscal/anticipations/batches/list", {
      params: {
        client_id: clientId,
        competence: competence || undefined,
        page,
        page_size: ANTICIPATION_PAGE_SIZE,
      },
    });
    return unwrapFiscalEnvelope<PaginatedResult<FiscalAnticipationBatch>>(response.data);
  },

  async detail(id: string): Promise<FiscalAnticipationBatchDetail> {
    const response = await api().get(`/fiscal/anticipations/batches/${id}`);
    return unwrapFiscalEnvelope<FiscalAnticipationBatchDetail>(response.data);
  },

  async importBatch(input: {
    clientId: string;
    competence: string;
    file: File;
  }): Promise<FiscalAnticipationBatchDetail> {
    const response = await api().post("/fiscal/anticipations/batches", {
      client_id: input.clientId,
      competence: input.competence,
      file_name: input.file.name,
      zip_base64: await fileToBase64(input.file),
    });
    return unwrapFiscalEnvelope<FiscalAnticipationBatchDetail>(response.data);
  },

  async updateItem(input: {
    batchId: string;
    itemId: string;
    changes: FiscalAnticipationItemChanges;
    reason: string;
  }): Promise<FiscalAnticipationItem> {
    const response = await api().put(
      `/fiscal/anticipations/batches/${input.batchId}/items/${input.itemId}`,
      { ...input.changes, reason: input.reason },
    );
    return unwrapFiscalEnvelope<FiscalAnticipationItem>(response.data);
  },

  async submit(input: { batchId: string; reviewerId: string }): Promise<FiscalAnticipationBatch> {
    const response = await api().post(`/fiscal/anticipations/batches/${input.batchId}/submit`, {
      reviewer_id: input.reviewerId,
    });
    return unwrapFiscalEnvelope<FiscalAnticipationBatch>(response.data);
  },

  async check(input: {
    batchId: string;
    decision: "approve" | "return";
    reason?: string;
  }): Promise<FiscalAnticipationBatch> {
    const response = await api().post(`/fiscal/anticipations/batches/${input.batchId}/check`, {
      decision: input.decision,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return unwrapFiscalEnvelope<FiscalAnticipationBatch>(response.data);
  },
};

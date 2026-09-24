import { setupAPIClient } from "@shared/services/api";

export type TriageOverviewStatus =
  | "URGENT_OPEN"
  | "ROUTINE_PENDING"
  | "BANK_PENDING"
  | "COMPLETE"
  | "NO_APPLICABLE_ITEMS";

export type TriageOverviewItem = {
  client_id: string;
  legal_name: string;
  competence: string;
  status: TriageOverviewStatus;
};

export type TriageOverviewIndicators = {
  urgent_open: number;
  routine_pending: number;
  bank_pending: number;
  complete: number;
  // Opcional até o triagem-service com o status novo estar publicado.
  no_applicable_items?: number;
};

export type TriageOverview = {
  items: TriageOverviewItem[];
  total: number;
  page: number;
  page_size: number;
  indicators: TriageOverviewIndicators;
};

export type TriageOverviewFilters = {
  page: number;
  pageSize: number;
  clientId?: string;
  competence?: string;
  status?: TriageOverviewStatus;
};

const TRIAGEM_OVERVIEW_ENDPOINT = "/triagem/overview";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const triagemOverviewService = {
  async list(filters: TriageOverviewFilters): Promise<TriageOverview> {
    const response = await setupAPIClient().get(TRIAGEM_OVERVIEW_ENDPOINT, {
      params: {
        page: filters.page,
        page_size: filters.pageSize,
        ...(filters.clientId ? { client_id: filters.clientId } : {}),
        ...(filters.competence ? { competence: filters.competence } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
    });
    return unwrap<TriageOverview>(response.data);
  },
};

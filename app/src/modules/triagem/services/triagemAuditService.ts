import { setupAPIClient } from "@shared/services/api";

export type TriageAuditItem = {
  id: string;
  action: string;
  actor: { id: string; name: string; full_name: string | null };
  competence: string;
  occurred_at: string;
  context: { before: unknown; after: unknown };
};

export type TriageAuditTimeline = {
  items: TriageAuditItem[];
  total: number;
  page: number;
  page_size: number;
};

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const triagemAuditService = {
  async listTimeline(
    competenceId: string,
    page = 1,
    pageSize = 20,
  ): Promise<TriageAuditTimeline> {
    const response = await setupAPIClient().get(
      `/triagem/competencies/${competenceId}/history`,
      { params: { page, page_size: pageSize } },
    );
    return unwrap<TriageAuditTimeline>(response.data);
  },
};

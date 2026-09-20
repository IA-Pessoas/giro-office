import { setupAPIClient } from "@shared/services/api";

export type TriageCompetence = {
  id: string;
  client_id: string;
  competence: string;
  configuration_snapshot: Record<string, unknown>;
  responsible_snapshot: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const TRIAGEM_COMPETENCE_ENDPOINT = "/triagem/competencies";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const triagemCompetenceService = {
  async list(clientId: string): Promise<TriageCompetence[]> {
    const response = await setupAPIClient().get(TRIAGEM_COMPETENCE_ENDPOINT, {
      params: { client_id: clientId, include_archived: true },
    });
    return unwrap<TriageCompetence[]>(response.data);
  },

  async create(clientId: string, competence: string): Promise<TriageCompetence> {
    const response = await setupAPIClient().post(TRIAGEM_COMPETENCE_ENDPOINT, {
      client_id: clientId,
      competence,
    });
    return unwrap<TriageCompetence>(response.data);
  },

  async archive(id: string): Promise<TriageCompetence> {
    const response = await setupAPIClient().patch(
      `${TRIAGEM_COMPETENCE_ENDPOINT}/${id}/archive`,
    );
    return unwrap<TriageCompetence>(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

export type TriageExternalLinkType = string;

export type TriageExternalLink = {
  id: string;
  client_id: string;
  competence: string;
  type: TriageExternalLinkType;
  url: string;
  description: string | null;
  responsible_id: string | null;
  responsible: { id: string; name: string; status: string } | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TriageExternalLinkInput = {
  type: TriageExternalLinkType;
  url: string;
  description?: string | null;
  responsible_id?: string | null;
};

const TRIAGEM_EXTERNAL_LINKS_ENDPOINT = "/triagem/external-links";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const triagemExternalLinkService = {
  async list(clientId: string, competence: string): Promise<TriageExternalLink[]> {
    const response = await setupAPIClient().get(TRIAGEM_EXTERNAL_LINKS_ENDPOINT, {
      params: { client_id: clientId, competence },
    });
    return unwrap<TriageExternalLink[]>(response.data);
  },

  async create(
    clientId: string,
    competence: string,
    input: TriageExternalLinkInput,
  ): Promise<TriageExternalLink> {
    const response = await setupAPIClient().post(TRIAGEM_EXTERNAL_LINKS_ENDPOINT, {
      client_id: clientId,
      competence,
      ...input,
    });
    return unwrap<TriageExternalLink>(response.data);
  },

  async update(id: string, input: TriageExternalLinkInput): Promise<TriageExternalLink> {
    const response = await setupAPIClient().put(
      `${TRIAGEM_EXTERNAL_LINKS_ENDPOINT}/${id}`,
      input,
    );
    return unwrap<TriageExternalLink>(response.data);
  },

  async archive(id: string): Promise<TriageExternalLink> {
    const response = await setupAPIClient().patch(
      `${TRIAGEM_EXTERNAL_LINKS_ENDPOINT}/${id}/archive`,
    );
    return unwrap<TriageExternalLink>(response.data);
  },
};

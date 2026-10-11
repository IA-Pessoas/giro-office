import { setupAPIClient } from "@shared/services/api";

/** Referência de nuvem do cliente (tipo e link externo); não guarda arquivo. */
export type TriageClientCloud = {
  id: string;
  client_id: string;
  type: string;
  link: string;
  updated_at: string;
};

export type TriageClientCloudInput = { type: string; link: string };

const TRIAGEM_CLOUDS_ENDPOINT = "/triagem/clouds";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const triagemCloudService = {
  async list(clientId: string): Promise<TriageClientCloud[]> {
    const response = await setupAPIClient().get(TRIAGEM_CLOUDS_ENDPOINT, {
      params: { client_id: clientId },
    });
    return unwrap(response.data);
  },
  async create(clientId: string, input: TriageClientCloudInput): Promise<TriageClientCloud> {
    const response = await setupAPIClient().post(TRIAGEM_CLOUDS_ENDPOINT, {
      client_id: clientId,
      ...input,
    });
    return unwrap(response.data);
  },
  async update(id: string, input: Partial<TriageClientCloudInput>): Promise<TriageClientCloud> {
    const response = await setupAPIClient().patch(`${TRIAGEM_CLOUDS_ENDPOINT}/${id}`, input);
    return unwrap(response.data);
  },
};

import { setupAPIClient } from "@shared/services/api";

export type TriageSolicitationStatus = "OPEN" | "CLOSED";

type UserRef = { id: string; name: string | null; full_name: string | null };

export type TriageSolicitation = {
  id: string;
  client_id: string;
  competence: string;
  category_id: string;
  description: string;
  requester_id: string;
  responsible_id: string;
  status: TriageSolicitationStatus;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string };
  category: { id: string; code: string; label: string };
  requester: UserRef;
  responsible: UserRef;
};

export type TriageSolicitationInput = {
  client_id: string;
  competence: string;
  category_id: string;
  description: string;
  responsible_id: string;
};

const ENDPOINT = "/triagem/solicitations";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const triagemSolicitationService = {
  async list(status: TriageSolicitationStatus): Promise<TriageSolicitation[]> {
    const response = await setupAPIClient().get(ENDPOINT, { params: { status } });
    return unwrap<TriageSolicitation[]>(response.data);
  },

  async create(input: TriageSolicitationInput): Promise<TriageSolicitation> {
    const response = await setupAPIClient().post(ENDPOINT, input);
    return unwrap<TriageSolicitation>(response.data);
  },

  async close(id: string): Promise<TriageSolicitation> {
    const response = await setupAPIClient().patch(`${ENDPOINT}/${id}/close`);
    return unwrap<TriageSolicitation>(response.data);
  },
};

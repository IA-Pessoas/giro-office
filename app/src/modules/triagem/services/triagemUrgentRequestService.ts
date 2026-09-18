import { setupAPIClient } from "@shared/services/api";

export type TriageUrgentRequestStatus = "OPEN" | "CLOSED";
export type TriageUrgencyCode = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TriageUrgentRequest = {
  id: string;
  client_id: string;
  competence: string;
  requester_id: string;
  responsible_id: string;
  urgency_code: TriageUrgencyCode;
  description: string;
  status: TriageUrgentRequestStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  requester: { id: string; name: string | null; full_name: string | null } | null;
  responsible: { id: string; name: string | null; full_name: string | null };
};

export type TriageUrgentRequestInput = {
  urgency_code: TriageUrgencyCode;
  description: string;
  responsible_id: string;
};

const ENDPOINT = "/triagem/urgent-requests";

function unwrap<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const triagemUrgentRequestService = {
  async list(clientId: string, competence: string): Promise<TriageUrgentRequest[]> {
    const response = await setupAPIClient().get(ENDPOINT, {
      params: { client_id: clientId, competence },
    });
    return unwrap<TriageUrgentRequest[]>(response.data);
  },

  async create(
    clientId: string,
    competence: string,
    input: TriageUrgentRequestInput,
  ): Promise<TriageUrgentRequest> {
    const response = await setupAPIClient().post(ENDPOINT, {
      client_id: clientId,
      competence,
      ...input,
    });
    return unwrap<TriageUrgentRequest>(response.data);
  },

  async update(id: string, input: TriageUrgentRequestInput): Promise<TriageUrgentRequest> {
    const response = await setupAPIClient().put(`${ENDPOINT}/${id}`, input);
    return unwrap<TriageUrgentRequest>(response.data);
  },

  async close(id: string, resolution_note: string): Promise<TriageUrgentRequest> {
    const response = await setupAPIClient().patch(`${ENDPOINT}/${id}/close`, { resolution_note });
    return unwrap<TriageUrgentRequest>(response.data);
  },

  async reopen(id: string): Promise<TriageUrgentRequest> {
    const response = await setupAPIClient().patch(`${ENDPOINT}/${id}/reopen`);
    return unwrap<TriageUrgentRequest>(response.data);
  },
};

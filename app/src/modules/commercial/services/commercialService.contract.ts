import type { CommercialSuccessEnvelope } from "../types";

export const COMMERCIAL_ENDPOINTS = {
  proposalConfigs: "/commercial/proposal-configs",
  proposalConfig: (id: string) => `/commercial/proposal-configs/${id}`,
  prospecting: "/commercial/prospecting",
  prospectingClients: "/commercial/prospecting/clients",
  prospectingItem: (id: string) => `/commercial/prospecting/${id}`,
  taskBillings: "/commercial/task-billing",
  taskBilling: (taskId: string) => `/commercial/task-billing/${taskId}`,
} as const;

export function unwrapCommercialEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as CommercialSuccessEnvelope<T>).data;
  }

  return body as T;
}

import type { CommercialSuccessEnvelope } from "../types";

export const COMMERCIAL_ENDPOINTS = {
  overview: "/client/commercial/overview",
  proposalConfigs: "/commercial/proposal-configs",
  proposalConfig: (id: string) => `/commercial/proposal-configs/${id}`,
} as const;

export function unwrapCommercialEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as CommercialSuccessEnvelope<T>).data;
  }

  return body as T;
}

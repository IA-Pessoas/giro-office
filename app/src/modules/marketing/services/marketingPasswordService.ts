import { api } from "@shared/services/apiClient";

import type { MarketingEnvelope } from "../types/marketingDashboard";

export type MarketingPassword = {
  id: string;
  local: string;
  user: string;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MarketingPasswordInput = {
  local: string;
  user: string;
  password: string;
  notes?: string | null;
};

export type MarketingPasswordUpdate = Partial<MarketingPasswordInput>;
export type MarketingPasswordReconciliation = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
};

async function unwrap<T>(promise: Promise<{ data: MarketingEnvelope<T> }>): Promise<T> {
  const response = await promise;
  if (!response.data.success || response.data.data === undefined) {
    throw new Error("A resposta de credenciais do Marketing é inválida.");
  }
  return response.data.data;
}

export const marketingPasswordService = {
  list: (): Promise<MarketingPassword[]> =>
    unwrap(api.get<MarketingEnvelope<MarketingPassword[]>>("/marketing/passwords/list")),
  detail: (id: string): Promise<MarketingPassword> =>
    unwrap(api.get<MarketingEnvelope<MarketingPassword>>(`/marketing/passwords/${id}`)),
  create: (input: MarketingPasswordInput): Promise<MarketingPassword> =>
    unwrap(api.post<MarketingEnvelope<MarketingPassword>>("/marketing/passwords", input)),
  update: (id: string, input: MarketingPasswordUpdate): Promise<MarketingPassword> =>
    unwrap(api.patch<MarketingEnvelope<MarketingPassword>>(`/marketing/passwords/${id}`, input)),
  reveal: (id: string): Promise<{ password: string }> =>
    unwrap(
      api.post<MarketingEnvelope<{ password: string }>>(
        `/marketing/passwords/${id}/reveal`,
        { confirmed: true },
      ),
    ),
  export: (id: string): Promise<MarketingPassword & { password: string }> =>
    unwrap(
      api.post<MarketingEnvelope<MarketingPassword & { password: string }>>(
        `/marketing/passwords/${id}/export`,
        { confirmed: true },
      ),
    ),
  importLegacy: (records: Array<Record<string, unknown>>): Promise<{
    imported: number;
    quarantined: number;
  }> =>
    unwrap(
      api.post<MarketingEnvelope<{ imported: number; quarantined: number }>>(
        "/marketing/passwords/import",
        { records },
      ),
    ),
  reconciliation: (): Promise<MarketingPasswordReconciliation[]> =>
    unwrap(
      api.get<MarketingEnvelope<MarketingPasswordReconciliation[]>>(
        "/marketing/passwords/import/reconciliation",
      ),
    ),
};

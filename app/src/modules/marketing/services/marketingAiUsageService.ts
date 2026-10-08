import { api } from "@shared/services/apiClient";

import type { MarketingEnvelope } from "../types/marketingDashboard";

export type AiUsageAnswers = {
  knowledge: boolean | null;
  integration: boolean | null;
  frequency: number | null;
  purpose: string | null;
  perceived_gain: string | null;
};

export type AiUsageControl = AiUsageAnswers & {
  id: string;
  competence: string;
  user: { id: string; name: string; full_name: string | null };
};

export type EligibleMarketingUser = { id: string; name: string; full_name: string | null };
export type MarketingAiUsageReconciliation = {
  id: string;
  legacy_user_id: string;
  legacy_competence: string;
  reason: string;
};

async function unwrap<T>(promise: Promise<{ data: MarketingEnvelope<T> }>): Promise<T> {
  const response = await promise;
  if (!response.data.success || response.data.data === undefined) {
    throw new Error("A resposta de pesquisa de IA é inválida.");
  }
  return response.data.data;
}

export const marketingAiUsageService = {
  getEligibleUsers: async (): Promise<EligibleMarketingUser[]> =>
    unwrap<EligibleMarketingUser[]>(api.get<MarketingEnvelope<EligibleMarketingUser[]>>("/marketing/ai-usage-controls/users")),
  getControls: async (competence: string): Promise<AiUsageControl[]> =>
    unwrap<AiUsageControl[]>(api.get<MarketingEnvelope<AiUsageControl[]>>("/marketing/ai-usage-controls/list", { params: { competence } })),
  getReport: async (competence: string): Promise<{ pending: AiUsageControl[]; withoutIntegration: AiUsageControl[] }> =>
    unwrap<{ pending: AiUsageControl[]; withoutIntegration: AiUsageControl[] }>(api.get<MarketingEnvelope<{ pending: AiUsageControl[]; withoutIntegration: AiUsageControl[] }>>("/marketing/ai-usage-controls/report", { params: { competence } })),
  getReconciliation: async (): Promise<MarketingAiUsageReconciliation[]> =>
    unwrap<MarketingAiUsageReconciliation[]>(api.get<MarketingEnvelope<MarketingAiUsageReconciliation[]>>("/marketing/ai-usage-controls/reconciliation")),
  importLegacy: async (records: Array<Record<string, unknown>>): Promise<{ imported: number; alreadyExisted: number; reconciliation: number }> =>
    unwrap<{ imported: number; alreadyExisted: number; reconciliation: number }>(api.post<MarketingEnvelope<{ imported: number; alreadyExisted: number; reconciliation: number }>>("/marketing/ai-usage-controls/import", { records })),
  createBatch: async (competence: string): Promise<{ created: number; alreadyExisted: number }> =>
    unwrap<{ created: number; alreadyExisted: number }>(api.post<MarketingEnvelope<{ created: number; alreadyExisted: number }>>("/marketing/ai-usage-controls/batch", { competence })),
  createOne: async (userId: string, competence: string): Promise<{ id: string }> =>
    unwrap<{ id: string }>(api.post<MarketingEnvelope<{ id: string }>>("/marketing/ai-usage-controls", { userId, competence })),
  update: async (id: string, answers: AiUsageAnswers): Promise<AiUsageControl> =>
    unwrap<AiUsageControl>(api.patch<MarketingEnvelope<AiUsageControl>>(`/marketing/ai-usage-controls/${id}`, answers)),
};

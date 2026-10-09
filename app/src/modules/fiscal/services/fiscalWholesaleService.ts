import { setupAPIClient } from "@shared/services/api";

import { unwrapFiscalEnvelope } from "./fiscalService.contract";

export interface FiscalClientWholesale {
  client_id: string;
  is_wholesale: boolean;
  updated_at: string | null;
  updated_by: string | null;
  history: Array<{
    previous_value: boolean;
    new_value: boolean;
    actor_user_id: string;
    created_at: string;
  }>;
}

const api = () =>
  setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });

export const fiscalWholesaleService = {
  async get(clientId: string): Promise<FiscalClientWholesale> {
    const response = await api().get(`/fiscal/clients/${clientId}/wholesale`);
    return unwrapFiscalEnvelope<FiscalClientWholesale>(response.data);
  },

  async set(clientId: string, isWholesale: boolean): Promise<FiscalClientWholesale> {
    const response = await api().put(`/fiscal/clients/${clientId}/wholesale`, {
      is_wholesale: isWholesale,
    });
    return unwrapFiscalEnvelope<FiscalClientWholesale>(response.data);
  },
};

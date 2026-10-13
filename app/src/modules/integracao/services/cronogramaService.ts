import { setupAPIClient } from "@shared/services/api";
import { unwrapServiceEnvelope } from "./envelope.contract";

export interface IntegracaoCronograma {
  client: { id: string; name: string; company_name: string | null };
  tasks: Array<{ id: string; name: string; prevision_date: string }>;
}

export const cronogramaService = {
  async list(clientId: string): Promise<IntegracaoCronograma> {
    const response = await setupAPIClient().get("/task/cronograma", {
      params: { client_id: clientId },
    });
    return unwrapServiceEnvelope(response.data) as IntegracaoCronograma;
  },
};

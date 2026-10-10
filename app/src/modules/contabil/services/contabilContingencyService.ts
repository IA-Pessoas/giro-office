import { setupAPIClient } from "@shared/services/api";
import { CONTABIL_ENDPOINTS, unwrapContabilEnvelope } from "./contabilService.contract";

export interface ContingencyParameters {
  client_id: string;
  company_name: string;
  cnpj: string;
  period_start: string;
  period_end: string;
  regime: string;
  annex: string;
  rate: number;
}
export interface ContingencyScenario {
  baseCents: number;
  taxCents: number;
  penaltyCents: number;
  interestCents: number;
  totalCents: number;
}
export interface ContingencySimulation {
  id: string;
  content_hash: string;
  parameters: ContingencyParameters & { filename: string };
  classification: "legacy_hypothesis";
  identity: "matched" | "not_found";
  extraction: Array<{
    key: string;
    label: string;
    sourceLabel: string;
    sheet: string;
    labelCell: string;
    valueCell: string;
    rawValue: string | number;
    valueCents: number;
  }>;
  differenceCents: number;
  internalTransfersCents: number;
  minimum: ContingencyScenario;
  maximum: ContingencyScenario;
}

export interface ContingencyReview {
  reviewed_by: string;
  reviewed_at: string;
  reviewed_hash: string;
}

export const contabilContingencyService = {
  async simulate({
    file,
    parameters,
    simulationId,
  }: {
    file: File;
    parameters: ContingencyParameters;
    simulationId?: string;
  }): Promise<ContingencySimulation> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.contingency, file, {
      params: { ...parameters, filename: file.name, simulation_id: simulationId },
      headers: { "Content-Type": "application/vnd.ms-excel" },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async review(result: ContingencySimulation): Promise<ContingencyReview> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.contingencyReview(result.id), {
      content_hash: result.content_hash,
    });
    return unwrapContabilEnvelope(response.data);
  },
  async download(result: ContingencySimulation): Promise<Blob> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.contingencyExport(result.id), {
      params: { content_hash: result.content_hash },
      responseType: "blob",
    });
    return response.data;
  },
};

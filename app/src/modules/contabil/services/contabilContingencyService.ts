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

export const contabilContingencyService = {
  async simulate({
    file,
    parameters,
  }: {
    file: File;
    parameters: ContingencyParameters;
  }): Promise<ContingencySimulation> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.contingency, file, {
      params: { ...parameters, filename: file.name },
      headers: { "Content-Type": "application/vnd.ms-excel" },
    });
    return unwrapContabilEnvelope(response.data);
  },
};

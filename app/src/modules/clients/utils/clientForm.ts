import type {
  Client,
  ClientFormValues,
  ClientTaxRegime,
  CreateClientPayload,
  UpdateClientPayload,
} from "../types";

import { normalizeDocumentValue } from "./documentValidation.ts";
import { mapClientStatusFromApi, mapClientStatusToApi } from "./statusMapper.ts";

export const CLIENT_TAX_REGIME_OPTIONS = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
] as const satisfies readonly ClientTaxRegime[];

function isClientTaxRegime(value: string | null | undefined): value is ClientTaxRegime {
  return CLIENT_TAX_REGIME_OPTIONS.includes(value as ClientTaxRegime);
}

function normalizeTaxRegime(value: ClientTaxRegime | ""): ClientTaxRegime | null {
  return value || null;
}

function getClientTaxRegime(value: string | null | undefined): ClientTaxRegime | "" {
  return isClientTaxRegime(value) ? value : "";
}

export function createClientFormInitialValues(client?: Partial<Client>): ClientFormValues {
  return {
    type: client?.type ?? "PJ",
    name: client?.name ?? "",
    company_name: client?.company_name ?? "",
    fantasy_name: client?.fantasy_name ?? "",
    cpf_cnpj: client?.cpf_cnpj ?? "",
    status: mapClientStatusFromApi(client?.status) || "Ativo",
    regime: getClientTaxRegime(client?.regime),
    service_unique: client?.service_unique ?? false,
  };
}

export function buildCreateClientPayload(
  values: ClientFormValues,
  organizationId: string,
): CreateClientPayload {
  return {
    organization_id: organizationId,
    type: values.type ?? "PJ",
    name: values.name.trim(),
    company_name: values.company_name.trim() || null,
    fantasy_name: values.fantasy_name.trim() || null,
    cpf_cnpj: normalizeDocumentValue(values.cpf_cnpj),
    status: mapClientStatusToApi(values.status),
    regime: normalizeTaxRegime(values.regime),
    service_unique: values.service_unique,
  };
}

export function buildUpdateClientPayload(
  values: ClientFormValues,
  currentRegime?: string | null,
): UpdateClientPayload {
  const regime = normalizeTaxRegime(values.regime);
  const preservesLegacyRegime = regime === null && currentRegime && !isClientTaxRegime(currentRegime);

  return {
    name: values.name.trim(),
    company_name: values.company_name.trim() || null,
    fantasy_name: values.fantasy_name.trim() || null,
    cpf_cnpj: normalizeDocumentValue(values.cpf_cnpj),
    status: mapClientStatusToApi(values.status),
    ...(preservesLegacyRegime ? {} : { regime }),
    service_unique: values.service_unique,
  };
}

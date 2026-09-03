import type {
  Client,
  ClientFormValues,
  CreateClientPayload,
  UpdateClientPayload,
} from "../types";

import { normalizeDocumentValue } from "./documentValidation.ts";
import { mapClientStatusFromApi, mapClientStatusToApi } from "./statusMapper.ts";

export const CLIENT_TAX_REGIME_OPTIONS = [
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
] as const;

function normalizeTaxRegime(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : null;
}

export function createClientFormInitialValues(client?: Partial<Client>): ClientFormValues {
  return {
    type: client?.type ?? "PJ",
    name: client?.name ?? "",
    company_name: client?.company_name ?? "",
    fantasy_name: client?.fantasy_name ?? "",
    cpf_cnpj: client?.cpf_cnpj ?? "",
    status: mapClientStatusFromApi(client?.status),
    regime: client?.regime ?? "",
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

export function buildUpdateClientPayload(values: ClientFormValues): UpdateClientPayload {
  return {
    name: values.name.trim(),
    company_name: values.company_name.trim() || null,
    fantasy_name: values.fantasy_name.trim() || null,
    cpf_cnpj: normalizeDocumentValue(values.cpf_cnpj),
    status: mapClientStatusToApi(values.status),
    regime: normalizeTaxRegime(values.regime),
    service_unique: values.service_unique,
  };
}

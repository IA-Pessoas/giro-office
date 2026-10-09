import type {
  Client,
  ClientFormValues,
  ClientTaxRegime,
  CreateClientPayload,
  UpdateClientPayload,
} from "../types";

import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";
import { normalizeCnpjInput } from "../../../shared/utils/inputFormatting.ts";

import { normalizeDocumentValue } from "./documentValidation.ts";
import { mapClientStatusFromApi, mapClientStatusToApi } from "./statusMapper.ts";

// Fonte única com Regularize e Fiscal (TAX_REGIME_OPTIONS em shared/src/regularize/guidance.ts).
export const CLIENT_TAX_REGIME_OPTIONS = TAX_REGIME_OPTIONS satisfies readonly ClientTaxRegime[];

function isClientTaxRegime(value: string | null | undefined): value is ClientTaxRegime {
  return CLIENT_TAX_REGIME_OPTIONS.includes(value as ClientTaxRegime);
}

function normalizeTaxRegime(value: string): string | null {
  return value.trim() || null;
}

/**
 * Opções do regime na ficha: regimes compartilhados, catálogo da organização e o valor já
 * gravado, que continua selecionável mesmo fora do catálogo (#1740).
 */
export function buildClientRegimeOptions(
  catalog: readonly string[],
  storedRegime?: string | null,
): string[] {
  const options = [...new Set<string>([...CLIENT_TAX_REGIME_OPTIONS, ...catalog])];
  return storedRegime && !options.includes(storedRegime) ? [...options, storedRegime] : options;
}

export function getClientTaxRegime(value: string | null | undefined): ClientTaxRegime | "" {
  return isClientTaxRegime(value) ? value : "";
}

function normalizeClientDocumentValue(
  value: string | null | undefined,
  type: ClientFormValues["type"],
): string {
  return type === "PJ" ? normalizeCnpjInput(value) : normalizeDocumentValue(value);
}

export function createClientFormInitialValues(client?: Partial<Client>): ClientFormValues {
  return {
    type: client?.type ?? "PJ",
    name: client?.name ?? "",
    company_name: client?.company_name ?? "",
    fantasy_name: client?.fantasy_name ?? "",
    cpf_cnpj: client?.cpf_cnpj ?? "",
    status: client?.status ? mapClientStatusFromApi(client.status) : "Ativo",
    regime: client?.regime ?? "",
    service_unique: client?.service_unique ?? false,
    address: client?.address ?? "",
    cep: client?.cep ?? "",
    neighborhood: client?.neighborhood ?? "",
    state: client?.state ?? "",
    city: client?.city ?? "",
  };
}

export function getClientInternalName(values: {
  type?: "PJ" | "PF";
  name: string;
  company_name: string;
  fantasy_name: string;
}): string {
  const name = values.name.trim();

  if (name || values.type !== "PJ") {
    return name;
  }

  return values.company_name.trim() || values.fantasy_name.trim();
}

export function buildCreateClientPayload(
  values: ClientFormValues,
  organizationId: string,
): CreateClientPayload {
  return {
    organization_id: organizationId,
    type: values.type ?? "PJ",
    name: getClientInternalName(values),
    company_name: values.company_name.trim() || null,
    fantasy_name: values.fantasy_name.trim() || null,
    cpf_cnpj: normalizeClientDocumentValue(values.cpf_cnpj, values.type),
    status: mapClientStatusToApi(values.status),
    regime: normalizeTaxRegime(values.regime),
    service_unique: values.service_unique,
    address: normalizeOptionalAddress(values.address),
    cep: normalizeOptionalAddress(values.cep),
    neighborhood: normalizeOptionalAddress(values.neighborhood),
    state: normalizeOptionalAddress(values.state),
    city: normalizeOptionalAddress(values.city),
  };
}

function normalizeOptionalAddress(value: string): string | null {
  return value.trim() || null;
}

export function buildUpdateClientPayload(values: ClientFormValues): UpdateClientPayload {

  return {
    name: getClientInternalName(values),
    company_name: values.company_name.trim() || null,
    fantasy_name: values.fantasy_name.trim() || null,
    cpf_cnpj: normalizeClientDocumentValue(values.cpf_cnpj, values.type),
    status: mapClientStatusToApi(values.status),
    regime: normalizeTaxRegime(values.regime),
    service_unique: values.service_unique,
    address: normalizeOptionalAddress(values.address),
    cep: normalizeOptionalAddress(values.cep),
    neighborhood: normalizeOptionalAddress(values.neighborhood),
    state: normalizeOptionalAddress(values.state),
    city: normalizeOptionalAddress(values.city),
  };
}

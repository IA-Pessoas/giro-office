import type {
  Client,
  ClientRegularizeFormValues,
  UpdateClientRegularizePayload,
} from "../types";
import { normalizeDocumentValue } from "./documentValidation";
import {
  normalizeDateInputValue,
  normalizeNullableTextValue,
  normalizeRequiredTextValue,
} from "./verticalForm";

const nullableTextFieldNames = [
  "dominio_code",
  "company_name",
  "fantasy_name",
  "cnae",
  "cnae_secondary",
  "responsible",
  "number",
  "email",
  "address",
  "cep",
  "neighborhood",
  "state",
  "city",
  "municipal_registration",
  "state_registration",
  "commercial_board_registration",
  "regime",
  "size",
  "segment",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

const dateFieldNames = [
  "customer_since",
  "opening_date",
  "start_strike",
  "end_strike",
  "deletion_date",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

const booleanFieldNames = [
  "contabil",
  "fiscal",
  "pessoal",
  "infoproduto",
  "consultoria",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

export const REGULARIZE_REGIME_OPTIONS = [
  "Simples Nacional",
  "Lucro Real",
  "Lucro Presumido",
  "MEI",
  "E-SOCIAL",
  "CNO",
  "CAEPF",
] as const;

export const REGULARIZE_SIZE_OPTIONS = ["DEMAIS", "EPP", "ME"] as const;

export const REGULARIZE_SEGMENT_OPTIONS = [
  "Contabilidade",
  "Mercado",
  "Infoproduto",
] as const;

export function createRegularizeInitialValues(client: Client): ClientRegularizeFormValues {
  return {
    dominio_code: client.dominio_code ?? "",
    name: client.name ?? "",
    company_name: client.company_name ?? "",
    fantasy_name: client.fantasy_name ?? "",
    cpf_cnpj: client.cpf_cnpj ?? "",
    cnae: client.cnae ?? "",
    cnae_secondary: client.cnae_secondary ?? "",
    responsible: client.responsible ?? "",
    cpf_responsible: client.cpf_responsible ?? "",
    number: client.number ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
    cep: client.cep ?? "",
    neighborhood: client.neighborhood ?? "",
    state: client.state ?? "",
    city: client.city ?? "",
    customer_since: normalizeDateInputValue(client.customer_since),
    municipal_registration: client.municipal_registration ?? "",
    state_registration: client.state_registration ?? "",
    commercial_board_registration: client.commercial_board_registration ?? "",
    opening_date: normalizeDateInputValue(client.opening_date),
    regime: client.regime ?? "",
    size: client.size ?? "",
    segment: client.segment ?? "",
    contabil: Boolean(client.contabil),
    fiscal: Boolean(client.fiscal),
    pessoal: Boolean(client.pessoal),
    infoproduto: Boolean(client.infoproduto),
    consultoria: Boolean(client.consultoria),
    start_strike: normalizeDateInputValue(client.start_strike),
    end_strike: normalizeDateInputValue(client.end_strike),
    deletion_date: normalizeDateInputValue(client.deletion_date),
  };
}

export function buildRegularizePayload(
  values: ClientRegularizeFormValues,
  client: Client,
): UpdateClientRegularizePayload {
  const payload: UpdateClientRegularizePayload = {};
  const currentValues = createRegularizeInitialValues(client);

  const nextName = normalizeRequiredTextValue(values.name);
  const currentName = normalizeRequiredTextValue(currentValues.name);

  if (nextName.length > 0 && nextName !== currentName) {
    payload.name = nextName;
  }

  const nextCpfCnpj = normalizeDocumentValue(values.cpf_cnpj);
  const currentCpfCnpj = normalizeDocumentValue(currentValues.cpf_cnpj);

  if (nextCpfCnpj.length > 0 && nextCpfCnpj !== currentCpfCnpj) {
    payload.cpf_cnpj = nextCpfCnpj;
  }

  const nextCpfResponsible = normalizeDocumentValue(values.cpf_responsible) || null;
  const currentCpfResponsible = normalizeDocumentValue(currentValues.cpf_responsible) || null;

  if (nextCpfResponsible !== currentCpfResponsible) {
    payload.cpf_responsible = nextCpfResponsible;
  }

  for (const fieldName of nullableTextFieldNames) {
    const nextValue = normalizeNullableTextValue(values[fieldName]);
    const currentValue = normalizeNullableTextValue(currentValues[fieldName]);

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  for (const fieldName of dateFieldNames) {
    const nextValue = normalizeDateInputValue(values[fieldName]);
    const currentValue = normalizeDateInputValue(currentValues[fieldName]);

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue || null;
    }
  }

  for (const fieldName of booleanFieldNames) {
    if (values[fieldName] !== currentValues[fieldName]) {
      payload[fieldName] = values[fieldName];
    }
  }

  return payload;
}

export function hasRegularizeChanges(values: ClientRegularizeFormValues, client: Client): boolean {
  return Object.keys(buildRegularizePayload(values, client)).length > 0;
}

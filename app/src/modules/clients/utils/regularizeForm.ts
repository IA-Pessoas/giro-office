import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";
import {
  formatBrazilianPhoneInput,
  formatCpfCnpjInput,
  formatCpfInput,
} from "../../../shared/utils/inputFormatting.ts";
import type {
  Client,
  ClientRegularizeFormValues,
  UpdateClientRegularizePayload,
} from "../types";

function normalizeDocumentValue(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeNullableTextValue(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredTextValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeDateInputValue(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
}

const nullableTextFieldNames = [
  "dominio_code",
  "company_name",
  "fantasy_name",
  "cnae",
  "cnae_secondary",
  "responsible",
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

const optionalDateFieldNames = [
  "customer_since",
  "opening_date",
  "start_strike",
  "end_strike",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

const nullableDateFieldNames = [
  "deletion_date",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

const optionalDateFieldLabels: Record<(typeof optionalDateFieldNames)[number], string> = {
  customer_since: "Cliente desde",
  opening_date: "Data de abertura",
  start_strike: "Início da paralisação",
  end_strike: "Fim da paralisação",
};

const booleanFieldNames = [
  "contabil",
  "fiscal",
  "pessoal",
  "infoproduto",
  "consultoria",
] as const satisfies ReadonlyArray<keyof ClientRegularizeFormValues>;

// Valor antigo (MEI, E-SOCIAL, CNO, CAEPF) continua visível até alguém escolher um regime válido.
export function getRegularizeRegimeOptions(current: string): string[] {
  const options: string[] = [...TAX_REGIME_OPTIONS];
  return current && !options.includes(current) ? [...options, current] : options;
}

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
    cpf_cnpj: formatCpfCnpjInput(client.cpf_cnpj ?? ""),
    cnae: client.cnae ?? "",
    cnae_secondary: client.cnae_secondary ?? "",
    responsible: client.responsible ?? "",
    cpf_responsible: formatCpfInput(client.cpf_responsible ?? ""),
    number: formatBrazilianPhoneInput(client.number ?? ""),
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

  const nextNumber = normalizeDocumentValue(values.number) || null;
  const currentNumber = normalizeDocumentValue(currentValues.number) || null;

  if (nextNumber !== currentNumber) {
    payload.number = nextNumber;
  }

  for (const fieldName of nullableTextFieldNames) {
    const nextValue = normalizeNullableTextValue(values[fieldName]);
    const currentValue = normalizeNullableTextValue(currentValues[fieldName]);

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  for (const fieldName of optionalDateFieldNames) {
    const nextValue = normalizeDateInputValue(values[fieldName]);
    const currentValue = normalizeDateInputValue(currentValues[fieldName]);

    if (nextValue.length === 0) {
      continue;
    }

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  for (const fieldName of nullableDateFieldNames) {
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

export function getRegularizeUnsupportedDateClearError(
  values: ClientRegularizeFormValues,
  client: Client,
): string | null {
  const currentValues = createRegularizeInitialValues(client);

  for (const fieldName of optionalDateFieldNames) {
    const nextValue = normalizeDateInputValue(values[fieldName]);
    const currentValue = normalizeDateInputValue(currentValues[fieldName]);

    if (currentValue.length > 0 && nextValue.length === 0) {
      return `Não é possível limpar ${optionalDateFieldLabels[fieldName].toLowerCase()} neste fluxo. Informe uma data válida.`;
    }
  }

  return null;
}

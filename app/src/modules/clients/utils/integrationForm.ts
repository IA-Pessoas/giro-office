import {
  formatBrazilianPhoneInput,
  formatCnpjInput,
  formatCpfInput,
  normalizeCnpjInput,
} from "../../../shared/utils/inputFormatting.ts";
import type {
  Client,
  ClientCompanyLookup,
  CreateClientIntegrationFormValues,
  CreateClientIntegrationPayload,
  UpdateClientIntegrationFormValues,
  UpdateClientIntegrationPayload,
} from "../types";
const nullableTextFieldNames = [
  "company_name",
  "fantasy_name",
  "responsible",
  "email",
  "agent",
  "instagram",
  "indication",
  "type_registration",
  "address",
  "cep",
  "neighborhood",
  "state",
  "city",
] as const satisfies ReadonlyArray<keyof UpdateClientIntegrationFormValues>;

const documentFieldNames = [
  "cpf_responsible",
  "cpf_agent",
] as const satisfies ReadonlyArray<keyof UpdateClientIntegrationFormValues>;

export function normalizeNullableTextValue(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDocumentValue(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Mesmo padrão do z.string().email() do backend (zod 3), para o erro aparecer antes do 400.
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export function getIntegrationEmailError(value: string | null | undefined): string | null {
  const email = (value ?? "").trim();

  return email && !EMAIL_PATTERN.test(email) ? "Informe um e-mail válido." : null;
}

// A máscara descarta letras; o aviso diz por que o que foi digitado sumiu.
export function getPhoneInputHint(rawValue: string): string | null {
  return /[a-zA-Z]/.test(rawValue) ? "Telefone aceita apenas números." : null;
}

// CNPJ igual ao salvo já foi consultado no cadastro; só um CNPJ novo dispara a consulta oficial.
export function getCnpjToLookup(current: string, saved: string | null | undefined): string {
  return normalizeCnpjInput(current) === normalizeCnpjInput(saved) ? "" : current;
}

export function hasUsableIntegrationData(client: Client | null | undefined): boolean {
  const value = client?.type === "PJ" ? normalizeCnpjInput(client.cpf_cnpj) : normalizeDocumentValue(client?.cpf_cnpj);
  return value.length > 0;
}

function normalizeIntegrationDocumentValue(value: string | null | undefined, type: "PJ" | "PF") {
  return type === "PJ" ? normalizeCnpjInput(value) : normalizeDocumentValue(value);
}

export function mergeClientCompanyLookup(
  values: CreateClientIntegrationFormValues,
  lookup: ClientCompanyLookup,
): CreateClientIntegrationFormValues;
export function mergeClientCompanyLookup(
  values: UpdateClientIntegrationFormValues,
  lookup: ClientCompanyLookup,
): UpdateClientIntegrationFormValues;
export function mergeClientCompanyLookup(
  values: CreateClientIntegrationFormValues | UpdateClientIntegrationFormValues,
  lookup: ClientCompanyLookup,
): CreateClientIntegrationFormValues | UpdateClientIntegrationFormValues {
  const next = {
    ...values,
    name: lookup.name ?? values.name,
    company_name: lookup.company_name ?? values.company_name,
    fantasy_name: lookup.fantasy_name ?? values.fantasy_name,
  };

  if ("opening_date" in next && lookup.opening_date) {
    next.opening_date = lookup.opening_date.slice(0, 10);
  }

  if ("address" in next) {
    next.address = lookup.address ?? next.address;
    next.cep = lookup.cep ?? next.cep;
    next.neighborhood = lookup.neighborhood ?? next.neighborhood;
    next.state = lookup.state ?? next.state;
    next.city = lookup.city ?? next.city;
  }

  const changed = Object.keys(next).some(
    (key) => next[key as keyof typeof next] !== values[key as keyof typeof values],
  );

  return changed ? next : values;
}

export function createClientIntegrationInitialValues(): CreateClientIntegrationFormValues {
  return {
    type: "PJ",
    name: "",
    cpf_cnpj: "",
    company_name: "",
    fantasy_name: "",
    opening_date: "",
    responsible: "",
    cpf_responsible: "",
    number: "",
    email: "",
    agent: "",
    cpf_agent: "",
    instagram: "",
    indication: "",
    participants_meet: "",
    meet_type: "",
    type_registration: "Existente",
    service_unique: false,
  };
}

export function createUpdateClientIntegrationInitialValues(
  client: Client,
): UpdateClientIntegrationFormValues {
  const type = client.type ?? "PJ";

  return {
    type,
    name: client.name ?? "",
    cpf_cnpj:
      type === "PJ"
        ? formatCnpjInput(client.cpf_cnpj ?? "")
        : formatCpfInput(client.cpf_cnpj ?? ""),
    company_name: client.company_name ?? "",
    fantasy_name: client.fantasy_name ?? "",
    responsible: client.responsible ?? "",
    cpf_responsible: formatCpfInput(client.cpf_responsible ?? ""),
    number: formatBrazilianPhoneInput(client.number ?? ""),
    email: client.email ?? "",
    agent: client.agent ?? "",
    cpf_agent: formatCpfInput(client.cpf_agent ?? ""),
    instagram: client.instagram ?? "",
    indication: client.indication ?? "",
    type_registration: client.type_registration ?? "Existente",
    service_unique: client.service_unique ?? false,
    address: client.address ?? "",
    cep: client.cep ?? "",
    neighborhood: client.neighborhood ?? "",
    state: client.state ?? "",
    city: client.city ?? "",
  };
}

export function buildCreateClientIntegrationPayload(
  values: CreateClientIntegrationFormValues,
  organizationId: string,
): CreateClientIntegrationPayload {
  return {
    organization_id: organizationId,
    type: values.type,
    name: values.name.trim(),
    cpf_cnpj: normalizeIntegrationDocumentValue(values.cpf_cnpj, values.type),
    company_name: normalizeNullableTextValue(values.company_name),
    fantasy_name: normalizeNullableTextValue(values.fantasy_name),
    opening_date: normalizeNullableTextValue(values.opening_date),
    responsible: normalizeNullableTextValue(values.responsible),
    cpf_responsible: normalizeDocumentValue(values.cpf_responsible) || null,
    number: normalizeDocumentValue(values.number) || null,
    email: normalizeNullableTextValue(values.email),
    agent: normalizeNullableTextValue(values.agent),
    cpf_agent: normalizeDocumentValue(values.cpf_agent) || null,
    instagram: normalizeNullableTextValue(values.instagram),
    indication: normalizeNullableTextValue(values.indication),
    participants_meet: normalizeNullableTextValue(values.participants_meet),
    meet_type: normalizeNullableTextValue(values.meet_type),
    type_registration: normalizeNullableTextValue(values.type_registration),
    service_unique: values.service_unique,
  };
}

export function buildUpdateClientIntegrationPayload(
  values: UpdateClientIntegrationFormValues,
  client: Client,
): UpdateClientIntegrationPayload {
  const payload: UpdateClientIntegrationPayload = {};
  const currentValues = createUpdateClientIntegrationInitialValues(client);

  if (values.type !== currentValues.type) {
    payload.type = values.type;
  }

  const nextName = values.name.trim();
  const currentName = currentValues.name.trim();

  if (nextName.length > 0 && nextName !== currentName) {
    payload.name = nextName;
  }

  const nextCpfCnpj = normalizeIntegrationDocumentValue(values.cpf_cnpj, values.type);
  const currentCpfCnpj = normalizeIntegrationDocumentValue(currentValues.cpf_cnpj, currentValues.type);

  if (nextCpfCnpj.length > 0 && nextCpfCnpj !== currentCpfCnpj) {
    payload.cpf_cnpj = nextCpfCnpj;
  }

  if (values.service_unique !== currentValues.service_unique) {
    payload.service_unique = values.service_unique;
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

  for (const fieldName of documentFieldNames) {
    const nextValue = normalizeDocumentValue(values[fieldName]) || null;
    const currentValue = normalizeDocumentValue(currentValues[fieldName]) || null;

    if (nextValue !== currentValue) {
      payload[fieldName] = nextValue;
    }
  }

  return payload;
}

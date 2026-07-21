import type {
  Client,
  CreateClientIntegrationFormValues,
  CreateClientIntegrationPayload,
  UpdateClientIntegrationFormValues,
  UpdateClientIntegrationPayload,
} from "../types";
const nullableTextFieldNames = [
  "company_name",
  "fantasy_name",
  "responsible",
  "number",
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

export function hasUsableIntegrationData(client: Client | null | undefined): boolean {
  return normalizeDocumentValue(client?.cpf_cnpj).length > 0;
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
  return {
    type: client.type ?? "PJ",
    name: client.name ?? "",
    cpf_cnpj: client.cpf_cnpj ?? "",
    company_name: client.company_name ?? "",
    fantasy_name: client.fantasy_name ?? "",
    responsible: client.responsible ?? "",
    cpf_responsible: client.cpf_responsible ?? "",
    number: client.number ?? "",
    email: client.email ?? "",
    agent: client.agent ?? "",
    cpf_agent: client.cpf_agent ?? "",
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
    cpf_cnpj: normalizeDocumentValue(values.cpf_cnpj),
    company_name: normalizeNullableTextValue(values.company_name),
    fantasy_name: normalizeNullableTextValue(values.fantasy_name),
    opening_date: normalizeNullableTextValue(values.opening_date),
    responsible: normalizeNullableTextValue(values.responsible),
    cpf_responsible: normalizeDocumentValue(values.cpf_responsible) || null,
    number: normalizeNullableTextValue(values.number),
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

  const nextCpfCnpj = normalizeDocumentValue(values.cpf_cnpj);
  const currentCpfCnpj = normalizeDocumentValue(currentValues.cpf_cnpj);

  if (nextCpfCnpj.length > 0 && nextCpfCnpj !== currentCpfCnpj) {
    payload.cpf_cnpj = nextCpfCnpj;
  }

  if (values.service_unique !== currentValues.service_unique) {
    payload.service_unique = values.service_unique;
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

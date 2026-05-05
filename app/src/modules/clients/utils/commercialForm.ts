import type {
  Client,
  ClientCommercialFormValues,
  UpdateClientCommercialPayload,
} from "../types";

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

export const COMMERCIAL_STATUS_OPTIONS = [
  { value: "Análise/Agendamento", label: "Análise/Agendamento" },
  { value: "Envio de Proposta", label: "Envio de Proposta" },
  { value: "Análise Financeira", label: "Análise Financeira" },
  { value: "Fechado", label: "Fechado" },
  { value: "Paralisado", label: "Paralisado" },
  { value: "Recusado pelo Cliente", label: "Recusado pelo Cliente" },
  { value: "Baixada", label: "Baixada" },
  { value: "Inativo", label: "Inativo" },
] as const;

export function createCommercialInitialValues(client: Client): ClientCommercialFormValues {
  return {
    prospecting_status: client.prospecting_status ?? "",
    date_status: normalizeDateInputValue(client.date_status),
    description_prospecting: client.description_prospecting ?? "",
    register_date_prospecting: normalizeDateInputValue(client.register_date_prospecting),
  };
}

export function buildCommercialPayload(
  values: ClientCommercialFormValues,
  client: Client,
): UpdateClientCommercialPayload {
  const currentValues = createCommercialInitialValues(client);

  return {
    prospecting_status: normalizeRequiredTextValue(values.prospecting_status),
    ...(normalizeDateInputValue(values.date_status) !==
    normalizeDateInputValue(currentValues.date_status)
      ? { date_status: normalizeDateInputValue(values.date_status) }
      : {}),
    ...(normalizeNullableTextValue(values.description_prospecting) !==
    normalizeNullableTextValue(currentValues.description_prospecting)
      ? {
          description_prospecting: normalizeNullableTextValue(values.description_prospecting),
        }
      : {}),
    ...(normalizeDateInputValue(values.register_date_prospecting) !==
    normalizeDateInputValue(currentValues.register_date_prospecting)
      ? { register_date_prospecting: normalizeDateInputValue(values.register_date_prospecting) }
      : {}),
  };
}

export function hasCommercialChanges(values: ClientCommercialFormValues, client: Client): boolean {
  const payload = buildCommercialPayload(values, client);
  const currentValues = createCommercialInitialValues(client);

  if (payload.prospecting_status !== normalizeRequiredTextValue(currentValues.prospecting_status)) {
    return true;
  }

  return Object.keys(payload).length > 1;
}

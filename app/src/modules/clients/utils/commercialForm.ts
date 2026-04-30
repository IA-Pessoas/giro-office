import type {
  Client,
  ClientCommercialFormValues,
  UpdateClientCommercialPayload,
} from "../types";
import {
  normalizeDateInputValue,
  normalizeNullableTextValue,
  normalizeRequiredTextValue,
} from "./verticalForm";

export const COMMERCIAL_STATUS_OPTIONS = [
  "Análise/Agendamento",
  "Envio de Proposta",
  "Análise Financeira",
  "Fechado",
  "Paralisado",
  "Recusado pelo Cliente",
  "Baixada",
  "Inativo",
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

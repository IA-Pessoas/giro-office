import type { ClientTerminationFormValues, TerminateClientPayload } from "../types";

function normalizeRequiredTextValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeMonthInputValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

  return trimmed;
}

export function createTerminationInitialValues(): ClientTerminationFormValues {
  return {
    reason: "",
    description: "",
    competence_output: "",
  };
}

export function isValidCompetenceOutput(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(normalizeMonthInputValue(value));
}

export function buildTerminationPayload(
  values: ClientTerminationFormValues,
): TerminateClientPayload {
  return {
    reason: normalizeRequiredTextValue(values.reason),
    description: normalizeRequiredTextValue(values.description),
    competence_output: normalizeMonthInputValue(values.competence_output),
  };
}

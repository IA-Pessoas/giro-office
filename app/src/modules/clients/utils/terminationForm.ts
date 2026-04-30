import type { ClientTerminationFormValues, TerminateClientPayload } from "../types";
import { normalizeMonthInputValue, normalizeRequiredTextValue } from "./verticalForm";

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

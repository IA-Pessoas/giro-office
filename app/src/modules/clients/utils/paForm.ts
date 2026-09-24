import { formatBrlInput, normalizeDigits } from "../../../shared/utils/inputFormatting.ts";

export const PA_MONEY_FIELD_NAMES = ["tax_billing", "management_billing", "system_value"] as const;

// Campo de valor aceita só dígitos, formatados como moeda; texto livre vira vazio.
export function formatPaMoneyInput(value: string): string {
  return normalizeDigits(value) ? formatBrlInput(value) : "";
}

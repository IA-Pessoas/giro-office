import { formatBrlAmount, formatBrlInput, normalizeDigits } from "../../../shared/utils/inputFormatting.ts";

export const PA_MONEY_FIELD_NAMES = new Set<string>(["tax_billing", "management_billing", "system_value"]);

// Mesmo formato aceito pelo backend: "R$ 1.234,56", "1234,56", "1500" ou "1500.5" (em reais).
const PT_BR_AMOUNT = /^((?:\d{1,3}(?:\.\d{3})+)|\d+)(?:,(\d{1,2}))?$/;
const DOT_DECIMAL_AMOUNT = /^(\d+)\.(\d{1,2})$/;

export function parsePaMoneyCents(value: string | null | undefined): number | null {
  const amount = value?.replace(/^R\$/, "").replace(/\s/g, "") ?? "";
  const match = PT_BR_AMOUNT.exec(amount) ?? DOT_DECIMAL_AMOUNT.exec(amount);

  if (!match) {
    return null;
  }

  const cents = Number(match[1].replace(/\./g, "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));

  return Number.isSafeInteger(cents) ? cents : null;
}

// Valor vindo da API: formata o que for moeda; texto legado aparece como está.
export function formatPaMoneyFromApi(value: string | null | undefined): string {
  const cents = parsePaMoneyCents(value);

  return cents === null ? (value ?? "") : formatBrlAmount(cents / 100);
}

// Campo de valor aceita só dígitos, formatados como moeda; texto livre vira vazio.
export function formatPaMoneyInput(value: string): string {
  return normalizeDigits(value) ? formatBrlInput(value) : "";
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Ponto como decimal, sem vírgula no texto: no fim ("R$ 150." do teclado numérico) ou colado
 * de fora com 1 ou 2 casas ("150.50"). No texto que a própria máscara exibe, ponto é milhar.
 */
function decimalDotToComma(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes(",")) return trimmed;
  if (trimmed.endsWith(".")) return `${trimmed.slice(0, -1)},`;
  if (!trimmed.startsWith("R$") && /^\d*\.\d{1,2}$/u.test(trimmed)) return trimmed.replace(".", ",");
  return trimmed;
}

/**
 * Partes de um valor em reais digitado: vírgula é o decimal e ponto é milhar, como na própria
 * exibição ("R$ 1.234,56"). Assim apagar um dígito de "R$ 1.234" não vira 1,23.
 */
function splitBrlTyped(value: string): { integer: string; fraction: string | null } | null {
  const cleaned = decimalDotToComma(value).replace(/[^\d,]/g, "");
  if (!/\d/u.test(cleaned)) return null;
  const comma = cleaned.indexOf(",");
  const integer = normalizeDigits(comma === -1 ? cleaned : cleaned.slice(0, comma)).replace(
    /^0+(?=\d)/u,
    "",
  );
  const fraction = comma === -1 ? null : normalizeDigits(cleaned.slice(comma + 1)).slice(0, 2);
  return { integer: integer || "0", fraction };
}

export function normalizeDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

/** Máscara HH:MM: o `<input type="time">` segue o locale do navegador e vira 12h em en-US. */
export function formatTimeInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

export function isValidTimeInput(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatCpfInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  let formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}`;

  if (digits.length > 6) {
    formatted += `.${digits.slice(6, 9)}`;
  }

  if (digits.length > 9) {
    formatted += `-${digits.slice(9, 11)}`;
  }

  return formatted;
}

export function formatCnpjInput(value: string): string {
  const normalized = normalizeCnpjInput(value);

  if (normalized.length <= 2) {
    return normalized;
  }

  let formatted = `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}`;

  if (normalized.length > 5) {
    formatted += `.${normalized.slice(5, 8)}`;
  }

  if (normalized.length > 8) {
    formatted += `/${normalized.slice(8, 12)}`;
  }

  if (normalized.length > 12) {
    formatted += `-${normalized.slice(12, 14)}`;
  }

  return formatted;
}

export function normalizeCnpjInput(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 14);
}

export { isValidCnpj } from "@workspace/shared/validation";

export function formatCpfCnpjInput(value: string): string {
  const normalized = normalizeCnpjInput(value);

  return /[A-Z]/.test(normalized) || normalized.length > 11
    ? formatCnpjInput(normalized)
    : formatCpfInput(normalized);
}

export function formatBrazilianPhoneInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits ? `(${digits}` : "";
  }

  const areaCode = digits.slice(0, 2);
  const phoneNumber = digits.slice(2);

  if (phoneNumber.length <= 5) {
    return `(${areaCode}) ${phoneNumber}`;
  }

  const firstGroupLength = digits.length <= 10 ? 4 : 5;

  return `(${areaCode}) ${phoneNumber.slice(0, firstGroupLength)}-${phoneNumber.slice(
    firstGroupLength,
  )}`;
}

/**
 * Máscara do campo de moeda enquanto o usuário digita, em reais com vírgula decimal (#1366):
 * "150,5" mostra "R$ 150,5" e "100" mostra "R$ 100" (antes os dígitos viravam centavos).
 */
export function formatBrlInput(value: string): string {
  const parts = splitBrlTyped(value);

  if (parts === null) {
    return value.trim() ? value : "";
  }

  const integer = parts.integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  return `R$ ${integer}${parts.fraction === null ? "" : `,${parts.fraction}`}`;
}

/** Valor numérico (da API) no formato do campo de moeda: 1234.5 → "R$ 1.234,50". */
export function formatBrlAmount(value: number): string {
  return brlFormatter.format(value).replace(/\u00A0/g, " ");
}

/**
 * Valor em reais digitado como decimal pt-BR: "100" é R$ 100,00 e "1.234,56" é R$ 1.234,56.
 * Diferente de parseBrlInput (máscara), aceita ponto decimal no texto livre.
 */
export function parseBrlDecimalInput(value: string): number | null {
  const cleaned = value.replace(/[^\d,.]/g, "");
  if (!/\d/u.test(cleaned)) return null;
  const separator = cleaned.includes(",") ? "," : /\.\d{1,2}$/u.test(cleaned) ? "." : null;
  const splitAt = separator ? cleaned.lastIndexOf(separator) : cleaned.length;
  const integer = normalizeDigits(cleaned.slice(0, splitAt)) || "0";
  const fraction = normalizeDigits(cleaned.slice(splitAt + 1))
    .padEnd(2, "0")
    .slice(0, 2);
  const cents = Number(`${integer}${fraction}`);
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

export function formatBrlDecimalInput(value: string): string {
  const amount = parseBrlDecimalInput(value);
  return amount === null ? "" : brlFormatter.format(amount).replace(/\u00A0/g, " ");
}

export function parseBrlInput(value: string): number | null {
  const parts = splitBrlTyped(value);
  if (parts === null) return null;

  const cents = Number(`${parts.integer}${(parts.fraction ?? "").padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

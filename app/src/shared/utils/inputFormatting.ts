const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseBrlCents(value: string): number | null {
  const digits = normalizeDigits(value);

  if (!digits) {
    return null;
  }

  const cents = Number(digits);

  return Number.isSafeInteger(cents) ? cents : null;
}

export function normalizeDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
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

const CNPJ_FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_WEIGHTS = [6, ...CNPJ_FIRST_WEIGHTS];

function cnpjCheckDigit(base: string, weights: number[]): number {
  // Alfanumérico (Receita, 2026): cada caractere vale o código ASCII menos 48; dígitos não mudam.
  const sum = weights.reduce(
    (total, weight, index) => total + (base.charCodeAt(index) - 48) * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ numérico ou alfanumérico com tamanho e dígitos verificadores válidos. */
export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/u.test(cnpj) || /^(.)\1{13}$/u.test(cnpj)) return false;
  const first = cnpjCheckDigit(cnpj.slice(0, 12), CNPJ_FIRST_WEIGHTS);
  const second = cnpjCheckDigit(`${cnpj.slice(0, 12)}${first}`, CNPJ_SECOND_WEIGHTS);
  return cnpj.endsWith(`${first}${second}`);
}

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

export function formatBrlInput(value: string): string {
  const cents = parseBrlCents(value);

  if (cents === null) {
    return value.trim() ? value : "";
  }

  return brlFormatter.format(cents / 100).replace(/\u00A0/g, " ");
}

/**
 * Valor em reais digitado como decimal pt-BR: "100" é R$ 100,00 e "1.234,56" é R$ 1.234,56.
 * Diferente de parseBrlInput, que lê os dígitos como centavos.
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
  return amount === null ? "" : brlFormatter.format(amount).replace(/ /g, " ");
}

export function parseBrlInput(value: string): number | null {
  const cents = parseBrlCents(value);

  return cents === null ? null : cents / 100;
}

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
  const digits = normalizeDigits(value).slice(0, 14);

  if (digits.length <= 2) {
    return digits;
  }

  let formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}`;

  if (digits.length > 5) {
    formatted += `.${digits.slice(5, 8)}`;
  }

  if (digits.length > 8) {
    formatted += `/${digits.slice(8, 12)}`;
  }

  if (digits.length > 12) {
    formatted += `-${digits.slice(12, 14)}`;
  }

  return formatted;
}

export function formatCpfCnpjInput(value: string): string {
  const digits = normalizeDigits(value);

  return digits.length <= 11 ? formatCpfInput(digits) : formatCnpjInput(digits);
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

export function parseBrlInput(value: string): number | null {
  const cents = parseBrlCents(value);

  return cents === null ? null : cents / 100;
}

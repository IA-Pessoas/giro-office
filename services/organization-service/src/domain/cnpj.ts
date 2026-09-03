const RAW_CNPJ_PATTERN = /^\d{14}$/u;
const FORMATTED_CNPJ_PATTERN = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/u;

export function normalizeCnpj(value: string): string {
  return FORMATTED_CNPJ_PATTERN.test(value) ? value.replace(/[./-]/gu, "") : value;
}

function calculateCheckDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  if (!RAW_CNPJ_PATTERN.test(value) && !FORMATTED_CNPJ_PATTERN.test(value)) {
    return false;
  }

  const digits = normalizeCnpj(value);
  if (/^(\d)\1{13}$/u.test(digits)) {
    return false;
  }

  const firstDigit = calculateCheckDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateCheckDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

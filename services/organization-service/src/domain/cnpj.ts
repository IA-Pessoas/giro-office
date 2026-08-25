export function normalizeCnpj(value: string): string {
  return value.replace(/[./-]/gu, "");
}

function calculateCheckDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (!/^\d{14}$/u.test(digits) || /^(\d)\1{13}$/u.test(digits)) {
    return false;
  }

  const firstDigit = calculateCheckDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateCheckDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

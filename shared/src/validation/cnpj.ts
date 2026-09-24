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

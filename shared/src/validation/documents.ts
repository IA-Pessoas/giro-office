import { isValidCnpj } from "./cnpj.js";

export type DocumentPersonType = "PF" | "PJ";

export function normalizeCpfCnpj(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cpfCheckDigit(base: string): number {
  const weight = base.length + 1;
  const sum = base
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (weight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = (value ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/u.test(cpf)) {
    return false;
  }

  const first = cpfCheckDigit(cpf.slice(0, 9));
  const second = cpfCheckDigit(cpf.slice(0, 9) + first);
  return cpf === `${cpf.slice(0, 9)}${first}${second}`;
}

export function isValidCpfCnpj(
  value: string | null | undefined,
  personType?: DocumentPersonType,
): boolean {
  const document = normalizeCpfCnpj(value);
  if (personType === "PF") {
    return isValidCpf(document);
  }
  if (personType === "PJ") {
    return isValidCnpj(document);
  }
  if (document.length === 11) {
    return isValidCpf(document);
  }
  if (document.length === 14) {
    return isValidCnpj(document);
  }
  return false;
}

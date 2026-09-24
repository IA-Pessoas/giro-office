import { isValidCnpj } from "./inputFormatting.ts";

function cpfCheckDigit(digits: number[]): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (digits.length + 1 - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  const digits = [...cpf].map(Number);
  const first = cpfCheckDigit(digits.slice(0, 9));
  const second = cpfCheckDigit(digits.slice(0, 10));
  return digits[9] === first && digits[10] === second;
}

// Motivo para revisar um CPF/CNPJ já gravado, ou null quando está válido ou vazio.
// O CNPJ (numérico ou alfanumérico) usa o mesmo validador do cadastro, em @workspace/shared.
export function getDocumentIssue(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }
  if (raw.includes("*")) {
    return "Documento mascarado";
  }
  const document = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (/^\d{11}$/.test(document)) {
    return isValidCpf(document) ? null : "Dígito verificador inválido";
  }
  if (/^[A-Z0-9]{12}\d{2}$/.test(document)) {
    return isValidCnpj(document) ? null : "Dígito verificador inválido";
  }
  return "Tamanho inválido";
}

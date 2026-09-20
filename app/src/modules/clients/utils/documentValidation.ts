import { normalizeCnpjInput } from "../../../shared/utils/inputFormatting.ts";

export type ClientPersonType = "PJ" | "PF";

export function normalizeDocumentValue(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatCpfInput(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpjInput(digits: string): string {
  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(
    8,
    12,
  )}-${digits.slice(12)}`;
}

export function formatCpfCnpjInput(
  value: string | null | undefined,
  personType: ClientPersonType,
): string {
  const limit = personType === "PF" ? 11 : 14;
  const document =
    personType === "PJ"
      ? normalizeCnpjInput(value).slice(0, limit)
      : normalizeDocumentValue(value).slice(0, limit);

  return personType === "PF" ? formatCpfInput(document) : formatCnpjInput(document);
}

export function validateCpfCnpjDocument(
  value: string,
  personType?: ClientPersonType,
): string | null {
  const document = personType === "PJ" ? normalizeCnpjInput(value) : normalizeDocumentValue(value);

  if (document.length === 0) {
    return "CPF/CNPJ é obrigatório.";
  }

  if (personType === "PF") {
    return document.length === 11 ? null : "CPF deve ter 11 dígitos.";
  }

  if (personType === "PJ") {
    return document.length === 14
      ? null
      : /[A-Z]/.test(document)
        ? "CNPJ deve ter 14 caracteres."
        : "CNPJ deve ter 14 dígitos.";
  }

  return document.length === 11 || document.length === 14
    ? null
    : /[A-Z]/.test(document)
      ? "CPF/CNPJ deve ter 11 ou 14 caracteres."
      : "CPF/CNPJ deve ter 11 ou 14 dígitos.";
}

export function validateOptionalCpfDocument(label: string, value: string): string | null {
  const digits = normalizeDocumentValue(value);

  if (digits.length === 0) {
    return null;
  }

  return digits.length === 11 ? null : `${label} deve ter 11 dígitos.`;
}

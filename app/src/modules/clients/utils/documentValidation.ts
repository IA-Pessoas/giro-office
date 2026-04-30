export type ClientPersonType = "PJ" | "PF";

export function normalizeDocumentValue(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function validateCpfCnpjDocument(
  value: string,
  personType?: ClientPersonType,
): string | null {
  const digits = normalizeDocumentValue(value);

  if (digits.length === 0) {
    return "CPF/CNPJ é obrigatório.";
  }

  if (personType === "PF") {
    return digits.length === 11 ? null : "CPF deve ter 11 dígitos.";
  }

  if (personType === "PJ") {
    return digits.length === 14 ? null : "CNPJ deve ter 14 dígitos.";
  }

  return digits.length === 11 || digits.length === 14
    ? null
    : "CPF/CNPJ deve ter 11 ou 14 dígitos.";
}

export function validateOptionalCpfDocument(label: string, value: string): string | null {
  const digits = normalizeDocumentValue(value);

  if (digits.length === 0) {
    return null;
  }

  return digits.length === 11 ? null : `${label} deve ter 11 dígitos.`;
}

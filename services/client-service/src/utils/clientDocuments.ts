import {
  type DocumentPersonType,
  isValidCpfCnpj,
  normalizeCpfCnpj,
  ServiceError,
} from "@workspace/shared";

export function getClientDocumentType(type: string | null | undefined): DocumentPersonType {
  return type === "PF" ? "PF" : "PJ";
}

export function normalizeClientDocument(value: string | null | undefined): string {
  return normalizeCpfCnpj(value);
}

export function assertValidClientDocument(
  value: string | null | undefined,
  type: string | null | undefined,
): string {
  const normalized = normalizeClientDocument(value);
  const personType = getClientDocumentType(type);

  if (!isValidCpfCnpj(normalized, personType)) {
    throw new ServiceError(400, `${personType === "PF" ? "CPF" : "CNPJ"} inválido.`);
  }

  return normalized;
}

export function isClientDocumentUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

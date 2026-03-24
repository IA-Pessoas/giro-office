import { ServiceError } from "@workspace/shared";

/**
 * Valida string não vazia após trim; retorna o valor trimado ou lança ServiceError 400.
 */
export function assertNonEmptyString(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ServiceError(400, `${field} é obrigatório.`);
  }
  return trimmed;
}

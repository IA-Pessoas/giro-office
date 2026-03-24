import { ServiceError } from "../http/errors.js";

/**
 * Converte valor de body/query em Date; falha com ServiceError 400 se ausente ou inválido.
 */
export function parseIsoDate(value: unknown, field: string): Date {
  if (value === undefined || value === null || value === "") {
    throw new ServiceError(400, `${field} é obrigatório.`);
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(400, `${field} inválido.`);
  }
  return date;
}

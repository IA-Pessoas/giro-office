import { ServiceError } from "./errors.js";

export function getSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

export function parsePositiveInteger(
  value: unknown,
  fieldName: string,
  fallback: number,
  max?: number,
): number {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  if (typeof max === "number" && parsed > max) {
    return max;
  }

  return parsed;
}

export function parseOptionalInteger(value: unknown, fieldName: string): number | undefined {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed)) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  return parsed;
}

export function parseOptionalDate(value: unknown, fieldName: string): string | undefined {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return undefined;
  }

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  return parsed.toISOString();
}

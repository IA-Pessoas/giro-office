const DEFAULT_DATABASE_POOL_MAX = 1;
const DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS = 5_000;

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  name: string,
): number {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} deve ser um inteiro positivo.`);
  }
  return parsed;
}

export function parseDatabasePoolMax(
  value: string | undefined,
  defaultValue = DEFAULT_DATABASE_POOL_MAX,
): number {
  return parsePositiveInteger(value, defaultValue, "DATABASE_POOL_MAX");
}

export function parseDatabasePoolConnectionTimeoutMs(
  value: string | undefined,
  defaultValue = DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS,
): number {
  return parsePositiveInteger(value, defaultValue, "DATABASE_POOL_CONNECTION_TIMEOUT_MS");
}

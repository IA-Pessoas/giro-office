const DEFAULT_DATABASE_POOL_MAX = 1;

export function parseDatabasePoolMax(
  value: string | undefined,
  defaultValue = DEFAULT_DATABASE_POOL_MAX,
): number {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("DATABASE_POOL_MAX deve ser um inteiro positivo.");
  }
  return parsed;
}

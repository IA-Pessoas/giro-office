export function optional(value: string): string | null;
export function optional<T>(value: string, transform: (value: string) => T | null): T | null;
export function optional<T>(value: string, transform?: (value: string) => T | null): string | T | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return transform ? transform(trimmed) : trimmed;
}

export function finiteNumber(value: string): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

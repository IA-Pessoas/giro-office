export const EMPTY_TEXT_MARKER = "******";

export function normalizeRequiredScalarText(value) {
  if (value === null || value === undefined) return EMPTY_TEXT_MARKER;
  const normalized = String(value).normalize("NFKC").trim();
  return normalized.length === 0 ? EMPTY_TEXT_MARKER : normalized;
}

export function isEmptyScalarText(value) {
  return value === null || value === undefined || String(value).trim().length === 0;
}

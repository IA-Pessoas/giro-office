export const PARCELAMENTO_QUERY_KEY = ["parcelamento"] as const;

export function parcelamentoQueryKey(
  ...parts: Array<string | number | boolean | null | undefined | object>
) {
  return [...PARCELAMENTO_QUERY_KEY, ...parts.filter((part) => part !== null && part !== undefined)];
}

export const PESSOAL_QUERY_KEY = ["pessoal"] as const;

export function pessoalQueryKey(...parts: Array<string | number | boolean | null | undefined>) {
  return [...PESSOAL_QUERY_KEY, ...parts.filter((part) => part !== null && part !== undefined)];
}

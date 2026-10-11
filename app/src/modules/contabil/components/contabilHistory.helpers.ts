export const CONTABIL_HISTORY_PAGE_SIZE = 20;

export function formatContabilControlHistoryValue(field: string, value: unknown) {
  if (field === "notes") {
    return typeof value === "string" && value.trim() ? value : "(vazio)";
  }
  if (value === true) return "Concluído";
  if (value === false) return "Pendente";
  return "—";
}

export function getContabilHistoryPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

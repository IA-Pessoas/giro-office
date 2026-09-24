import type {
  ContabilControl,
  ContabilCompetence,
  ContabilControlField,
} from "../types";

export function getCurrentContabilCompetence(date = new Date()): ContabilCompetence {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}` as ContabilCompetence;
}

export function getContabilCompletionPercent(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export type ContabilControlFieldSaveStatus = "idle" | "saving" | "saved" | "error";

export function createContabilFieldStatusMap(
  fields: readonly { field: ContabilControlField }[],
): Record<ContabilControlField, ContabilControlFieldSaveStatus> {
  return fields.reduce(
    (acc, field) => {
      acc[field.field] = "idle";
      return acc;
    },
    {} as Record<ContabilControlField, ContabilControlFieldSaveStatus>,
  );
}

export function updateContabilControlFieldStatus(
  current: Record<ContabilControlField, ContabilControlFieldSaveStatus>,
  field: ContabilControlField,
  status: ContabilControlFieldSaveStatus,
) {
  return {
    ...current,
    [field]: status,
  };
}

export function applyLocalContabilFieldValue(
  control: ContabilControl,
  field: ContabilControlField,
  value: boolean | string,
): ContabilControl {
  return {
    ...control,
    [field]: value,
  };
}

export function rollbackContabilFieldValue(
  current: ContabilControl,
  confirmed: ContabilControl,
  field: ContabilControlField,
): ContabilControl {
  return {
    ...current,
    [field]: confirmed[field],
  };
}

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filterContabilPortfolioRows<
  Row extends { searchText: string; values: Record<string, string> },
>(rows: readonly Row[], search: string, filters: Record<string, string>): Row[] {
  const term = normalizeSearchText(search.trim());

  return rows.filter(
    (row) =>
      (!term || normalizeSearchText(row.searchText).includes(term)) &&
      Object.entries(filters).every(([key, value]) => !value || row.values[key] === value),
  );
}

// O visualizador sempre espelha o GET. O editor tem estado local (salvamentos em curso), então só
// adota o GET quando o registro muda: carga inicial, troca de competência, arquivamento.
export function shouldSyncRemoteContabilControl(
  canEdit: boolean,
  currentControlId: string | null,
  remote: Pick<ContabilControl, "id"> | null | undefined,
): boolean {
  if (!canEdit) return true;
  return (remote?.id ?? null) !== currentControlId;
}

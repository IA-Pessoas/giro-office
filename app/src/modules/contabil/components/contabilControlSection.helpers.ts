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

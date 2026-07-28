import type { AssignableUser } from "@modules/rh/types";

import type {
  ContabilRelationship,
  ContabilResponsible,
} from "../types";

export interface ContabilResponsibleFormValues {
  person_responsible_id: string;
  posted_by_id: string;
  customer_with_movement: boolean;
}

export interface ContabilRelationshipFormValues {
  bidding: boolean;
  chart_accounts: string;
  tool: string;
  system: string;
  note: string;
}

export interface ContabilSelectOption {
  value: string;
  label: string;
}

function isContabilDepartment(departmentName: string | null): boolean {
  return departmentName
    ? departmentName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("contabil")
    : false;
}

export function buildContabilResponsibleFormValues(
  responsible: ContabilResponsible | null,
): ContabilResponsibleFormValues {
  return {
    person_responsible_id: responsible?.person_responsible_id ?? "",
    posted_by_id: responsible?.posted_by_id ?? "",
    customer_with_movement: responsible?.customer_with_movement ?? false,
  };
}

export function buildContabilRelationshipFormValues(
  relationship: ContabilRelationship | null,
): ContabilRelationshipFormValues {
  return {
    bidding: relationship?.bidding ?? false,
    chart_accounts: relationship?.chart_accounts ?? "",
    tool: relationship?.tool ?? "",
    system: relationship?.system ?? "",
    note: relationship?.note ?? "",
  };
}

export function mapAssignableUsersToContabilOptions(
  users: AssignableUser[],
  currentUserIds: readonly string[] = [],
): ContabilSelectOption[] {
  const currentUserIdSet = new Set(currentUserIds.filter(Boolean));

  return users
    .filter(
      (user) =>
        isContabilDepartment(user.departmentName) || currentUserIdSet.has(user.id),
    )
    .map((user) => ({
      value: user.id,
      label: [user.name.trim(), user.departmentName].filter(Boolean).join(" - "),
    }));
}

export function getContabilSelectLabel(
  value: string | null | undefined,
  options: ContabilSelectOption[],
) {
  if (!value) {
    return "Não informado";
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

export function isContabilTextValueFilled(value: string) {
  return value.trim().length > 0;
}

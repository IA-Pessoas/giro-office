import type { AssignableUser } from "@modules/rh/types";

import type {
  ContabilRelationship,
  ContabilResponsible,
  UpdateContabilRelationshipPayload,
} from "../types";

export interface ContabilResponsibleFormValues {
  person_responsible_id: string;
  posted_by_id: string;
  customer_with_movement: boolean;
}

export interface ContabilRelationshipFormValues {
  // "" = não selecionado; selects não carregam boolean.
  bidding: "" | "true" | "false";
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
    bidding:
      relationship?.bidding === true ? "true" : relationship?.bidding === false ? "false" : "",
    chart_accounts: relationship?.chart_accounts ?? "",
    tool: relationship?.tool ?? "",
    system: relationship?.system ?? "",
    note: relationship?.note ?? "",
  };
}

// Espelha CONTABIL_CHART_ACCOUNTS_OPTIONS do contabil-service.
export const CONTABIL_CHART_ACCOUNTS_OPTIONS = [
  "Sim",
  "Não",
  "Sim — Jonrick",
  "Não — Jonrick",
] as const;

const UNSELECTED_LABEL = "Não selecionado";

export function formatContabilBidding(value: boolean | null | undefined) {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  return UNSELECTED_LABEL;
}

export function formatContabilChartAccounts(value: string | null | undefined) {
  if (!value) return UNSELECTED_LABEL;
  return (CONTABIL_CHART_ACCOUNTS_OPTIONS as readonly string[]).includes(value)
    ? value
    : `${value} (texto legado)`;
}

// Texto livre migrado entra como opção própria para não ser trocado em silêncio.
export function getContabilChartAccountsOptions(
  current: string | null | undefined,
): ContabilSelectOption[] {
  const options = [
    { value: "", label: UNSELECTED_LABEL },
    ...CONTABIL_CHART_ACCOUNTS_OPTIONS.map((value) => ({ value, label: value })),
  ];
  return current && !options.some((option) => option.value === current)
    ? [...options, { value: current, label: formatContabilChartAccounts(current) }]
    : options;
}

export function buildContabilRelationshipPayload(
  values: ContabilRelationshipFormValues,
): Required<UpdateContabilRelationshipPayload> {
  return {
    bidding: values.bidding === "" ? null : values.bidding === "true",
    chart_accounts: values.chart_accounts || null,
    tool: values.tool.trim(),
    system: values.system.trim(),
    note: values.note,
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

  return options.find((option) => option.value === value)?.label ?? "Usuário não encontrado";
}

export function isContabilTextValueFilled(value: string) {
  return value.trim().length > 0;
}

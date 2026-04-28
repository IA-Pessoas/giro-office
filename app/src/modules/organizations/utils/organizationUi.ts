import type { Organization } from "../types";

export const ORGANIZATION_PLAN_OPTIONS = ["trial", "pro", "enterprise"] as const;

export type OrganizationPlanOption = (typeof ORGANIZATION_PLAN_OPTIONS)[number];

export type OrganizationStatusBadge = {
  label: "Ativa" | "Inativa";
  className: string;
};

export function getOrganizationStatusBadge(status: Organization["status"] | string): OrganizationStatusBadge {
  if (status === "active" || status === "trial") {
    return {
      label: "Ativa",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    };
  }

  return {
    label: "Inativa",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
}

export function getOrganizationDrafts(organization: Organization | undefined) {
  return {
    logoDraft: organization?.logo_url ?? "",
    planDraft: isOrganizationPlanOption(organization?.subscription_plan)
      ? organization.subscription_plan
      : ORGANIZATION_PLAN_OPTIONS[0],
  };
}

export function isOrganizationPlanOption(value: string | null | undefined): value is OrganizationPlanOption {
  return ORGANIZATION_PLAN_OPTIONS.includes(value as OrganizationPlanOption);
}

export function getOrganizationPlanLabel(plan: string): string {
  if (plan === "trial") {
    return "Trial";
  }

  if (plan === "pro") {
    return "Pro";
  }

  if (plan === "enterprise") {
    return "Enterprise";
  }

  return plan;
}

export function formatOrganizationCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");

  if (digits.length !== 14) {
    return cnpj;
  }

  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

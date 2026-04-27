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

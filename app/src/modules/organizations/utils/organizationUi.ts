import type { StatusBadgeConfig } from "@shared/components/StatusBadge";
import type { Organization } from "../types";

export const ORGANIZATION_PLAN_OPTIONS = ["trial", "pro", "enterprise"] as const;

export type OrganizationPlanOption = (typeof ORGANIZATION_PLAN_OPTIONS)[number];

export type OrganizationStatusBadge = StatusBadgeConfig & {
  label: "Ativa" | "Inativa";
};

export function getOrganizationStatusBadge(status: Organization["status"] | string): OrganizationStatusBadge {
  if (status === "active" || status === "trial") {
    return {
      label: "Ativa",
      variant: "success",
    };
  }

  return {
    label: "Inativa",
    variant: "neutral",
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

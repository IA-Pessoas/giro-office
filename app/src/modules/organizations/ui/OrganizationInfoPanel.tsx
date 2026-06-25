import { Building2, CreditCard, Mail } from "lucide-react";

import { StatusBadge } from "@shared/components/StatusBadge";
import { resolvePhotoUrl } from "@shared/utils";
import type { Organization } from "../types";
import {
  formatOrganizationCnpj,
  getOrganizationPlanLabel,
  getOrganizationStatusBadge,
} from "../utils/organizationUi";

const ORGANIZATION_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_CARD_CLASSNAME =
  "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

interface OrganizationInfoPanelProps {
  organization: Organization;
  userEmail: string;
}

export function OrganizationInfoPanel({ organization, userEmail }: OrganizationInfoPanelProps) {
  const statusBadge = getOrganizationStatusBadge(organization.status);
  const resolvedLogoUrl = resolvePhotoUrl(organization.logo_url);

  return (
    <div className={`${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-5 p-5`}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {resolvedLogoUrl ? (
            <img
              src={resolvedLogoUrl}
              alt={`Logo de ${organization.name}`}
              className="h-full w-full object-contain p-2.5"
            />
          ) : (
            <Building2 className="h-7 w-7 text-[var(--colors-brand-gradient-end)]" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-semibold text-slate-900 dark:text-white">
              {organization.name}
            </p>
            <StatusBadge config={statusBadge} className="px-3 font-semibold" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className={`${ORGANIZATION_CARD_CLASSNAME} space-y-2`}>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <Building2 className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
            <p className="text-sm font-medium">CNPJ</p>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {formatOrganizationCnpj(organization.cnpj)}
          </p>
        </section>

        <section className={`${ORGANIZATION_CARD_CLASSNAME} space-y-2`}>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <CreditCard className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
            <p className="text-sm font-medium">Plano</p>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {getOrganizationPlanLabel(organization.subscription_plan)}
          </p>
        </section>

        <section className={`${ORGANIZATION_CARD_CLASSNAME} space-y-2`}>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <Mail className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
            <p className="text-sm font-medium">E-mail</p>
          </div>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{userEmail}</p>
        </section>
      </div>
    </div>
  );
}

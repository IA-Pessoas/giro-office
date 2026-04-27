import type { Organization } from "../types";
import { getOrganizationStatusBadge } from "../utils/organizationUi";

const ORGANIZATION_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

interface OrganizationInfoPanelProps {
  organization: Organization;
}

export function OrganizationInfoPanel({ organization }: OrganizationInfoPanelProps) {
  const statusBadge = getOrganizationStatusBadge(organization.status);

  return (
    <div className={`${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-4 p-5`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
            {organization.name}
          </p>
          <p className={ORGANIZATION_MUTED_CLASSNAME}>{organization.email_created_by}</p>
        </div>

        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-1">
          <p className={ORGANIZATION_MUTED_CLASSNAME}>CNPJ</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{organization.cnpj}</p>
        </section>

        <section className="space-y-1">
          <p className={ORGANIZATION_MUTED_CLASSNAME}>Plano atual</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {organization.subscription_plan}
          </p>
        </section>

        <section className="space-y-1 md:col-span-2">
          <p className={ORGANIZATION_MUTED_CLASSNAME}>Status</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{organization.status}</p>
        </section>
      </div>
    </div>
  );
}

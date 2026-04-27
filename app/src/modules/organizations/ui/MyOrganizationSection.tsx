import { useEffect, useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { useCurrentOrganization } from "../hooks/useCurrentOrganization";
import { getOrganizationDrafts, type OrganizationPlanOption } from "../utils/organizationUi";
import { OrganizationInfoPanel } from "./OrganizationInfoPanel";
import { OrganizationLogoForm } from "./OrganizationLogoForm";
import { OrganizationPlanForm } from "./OrganizationPlanForm";

const ORGANIZATION_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const ORGANIZATION_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

interface MyOrganizationSectionProps {
  organizationId: string;
}

export function MyOrganizationSection({ organizationId }: MyOrganizationSectionProps) {
  const organizationQuery = useCurrentOrganization(organizationId);
  const [logoDraft, setLogoDraft] = useState("");
  const [planDraft, setPlanDraft] = useState<OrganizationPlanOption>("trial");

  useEffect(() => {
    if (!organizationQuery.data) {
      return;
    }

    const drafts = getOrganizationDrafts(organizationQuery.data);
    setLogoDraft(drafts.logoDraft);
    setPlanDraft(drafts.planDraft);
  }, [organizationQuery.data]);

  return (
    <section className={`${ORGANIZATION_PANEL_CLASSNAME} p-6 lg:p-8`}>
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Minha organizacao</h2>
          </div>
          <p className={ORGANIZATION_MUTED_CLASSNAME}>
            Consulte os dados da sua organizacao e mantenha a configuracao atualizada.
          </p>
        </div>

        {organizationQuery.isLoading ? (
          <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} flex items-center gap-3 p-6`}>
            <LoaderCircle className="h-5 w-5 animate-spin text-[var(--colors-brand-gradient-end)]" />
            <p className={ORGANIZATION_MUTED_CLASSNAME}>Carregando dados da organizacao.</p>
          </div>
        ) : null}

        {!organizationQuery.isLoading && (organizationQuery.isError || !organizationQuery.data) ? (
          <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} space-y-3 p-6`}>
            <p className="text-sm text-slate-700 dark:text-white">
              Nao foi possivel carregar os dados da organizacao atual.
            </p>
          </div>
        ) : null}

        {organizationQuery.data ? (
          <div className="space-y-5">
            <OrganizationInfoPanel organization={organizationQuery.data} />
            <OrganizationLogoForm
              organizationName={organizationQuery.data.name}
              logoDraft={logoDraft}
              logoUrl={organizationQuery.data.logo_url}
              onLogoDraftChange={setLogoDraft}
            />
            <OrganizationPlanForm
              currentPlan={organizationQuery.data.subscription_plan}
              planDraft={planDraft}
              onPlanDraftChange={setPlanDraft}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

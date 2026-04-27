import { useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { useCurrentOrganization } from "../hooks/useCurrentOrganization";
import {
  useUpdateOrganizationLogo,
  useUpdateOrganizationPlan,
} from "../hooks/useCurrentOrganizationMutations";
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
  const updateOrganizationLogoMutation = useUpdateOrganizationLogo();
  const updateOrganizationPlanMutation = useUpdateOrganizationPlan();
  const [logoDraft, setLogoDraft] = useState("");
  const [planDraft, setPlanDraft] = useState<OrganizationPlanOption>("trial");

  const serverDrafts = useMemo(
    () => getOrganizationDrafts(organizationQuery.data),
    [organizationQuery.data],
  );

  useEffect(() => {
    if (!organizationQuery.data) {
      return;
    }

    setLogoDraft(serverDrafts.logoDraft);
    setPlanDraft(serverDrafts.planDraft);
  }, [organizationQuery.data, serverDrafts]);

  const isSavingLogo = updateOrganizationLogoMutation.isPending;
  const isSavingPlan = updateOrganizationPlanMutation.isPending;
  const canSaveLogo = !isSavingLogo && logoDraft.trim() !== serverDrafts.logoDraft.trim();
  const canSavePlan = !isSavingPlan && planDraft !== serverDrafts.planDraft;
  const hasOrganizationData = Boolean(organizationQuery.data);
  const shouldShowFetchError =
    !organizationQuery.isLoading && !hasOrganizationData && organizationQuery.isError;
  const shouldShowRefetchWarning = hasOrganizationData && organizationQuery.isError;

  const handleSaveLogo = async () => {
    if (!canSaveLogo) {
      return;
    }

    try {
      await updateOrganizationLogoMutation.mutateAsync({
        organizationId,
        logoUrl: logoDraft.trim() || null,
      });
    } catch {
      // Toasts are handled by the mutation hook.
    }
  };

  const handleCancelLogo = () => {
    setLogoDraft(serverDrafts.logoDraft);
  };

  const handleSavePlan = async () => {
    if (!canSavePlan) {
      return;
    }

    try {
      await updateOrganizationPlanMutation.mutateAsync({
        organizationId,
        subscriptionPlan: planDraft,
      });
    } catch {
      // Toasts are handled by the mutation hook.
    }
  };

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

        {shouldShowFetchError ? (
          <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} space-y-3 p-6`}>
            <p className="text-sm text-slate-700 dark:text-white">
              Nao foi possivel carregar os dados da organizacao atual.
            </p>
            <button
              type="button"
              onClick={() => void organizationQuery.refetch()}
              className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {organizationQuery.data ? (
          <div className="space-y-5">
            {shouldShowRefetchWarning ? (
              <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} space-y-2`}>
                <p className="text-sm text-slate-700 dark:text-white">
                  Os dados mais recentes da organizacao nao puderam ser recarregados agora.
                </p>
              </div>
            ) : null}

            <OrganizationInfoPanel organization={organizationQuery.data} />
            <OrganizationLogoForm
              organizationName={organizationQuery.data.name}
              logoDraft={logoDraft}
              logoUrl={organizationQuery.data.logo_url}
              isSaving={isSavingLogo}
              canSave={canSaveLogo}
              onLogoDraftChange={setLogoDraft}
              onSave={() => void handleSaveLogo()}
              onCancel={handleCancelLogo}
            />
            <OrganizationPlanForm
              currentPlan={organizationQuery.data.subscription_plan}
              planDraft={planDraft}
              isSaving={isSavingPlan}
              canSave={canSavePlan}
              onPlanDraftChange={setPlanDraft}
              onSave={() => void handleSavePlan()}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

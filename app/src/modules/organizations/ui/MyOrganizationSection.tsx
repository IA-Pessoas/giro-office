import { useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle, Sparkles } from "lucide-react";

import { Dialog } from "@shared/components";
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
  userEmail: string;
}

export function MyOrganizationSection({ organizationId, userEmail }: MyOrganizationSectionProps) {
  const organizationQuery = useCurrentOrganization(organizationId);
  const updateOrganizationLogoMutation = useUpdateOrganizationLogo();
  const updateOrganizationPlanMutation = useUpdateOrganizationPlan();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
      return false;
    }

    try {
      await updateOrganizationLogoMutation.mutateAsync({
        organizationId,
        logoUrl: logoDraft.trim() || null,
      });
      return true;
    } catch {
      // Toasts are handled by the mutation hook.
      return false;
    }
  };

  const handleCancelLogo = () => {
    setLogoDraft(serverDrafts.logoDraft);
  };

  const handleRemoveLogo = async () => {
    if (isSavingLogo || !organizationQuery.data?.logo_url) {
      return false;
    }

    try {
      setLogoDraft("");
      await updateOrganizationLogoMutation.mutateAsync({
        organizationId,
        logoUrl: null,
      });
      return true;
    } catch {
      setLogoDraft(serverDrafts.logoDraft);
      return false;
    }
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

  const handleEditDialogOpenChange = (open: boolean) => {
    setIsEditDialogOpen(open);

    if (!open) {
      setLogoDraft(serverDrafts.logoDraft);
      setPlanDraft(serverDrafts.planDraft);
    }
  };

  return (
    <section className={`${ORGANIZATION_PANEL_CLASSNAME} p-6 lg:p-8`}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-950/40 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Minha organização</h2>
            </div>
            <p className={ORGANIZATION_MUTED_CLASSNAME}>Consulte os dados da sua organização.</p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditDialogOpen(true)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 lg:w-fit"
          >
            <Sparkles className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
            Editar organização
          </button>
        </div>

        {organizationQuery.isLoading ? (
          <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} flex items-center gap-3 p-6`}>
            <LoaderCircle className="h-5 w-5 animate-spin text-[var(--colors-brand-gradient-end)]" />
            <p className={ORGANIZATION_MUTED_CLASSNAME}>Carregando dados da organização.</p>
          </div>
        ) : null}

        {shouldShowFetchError ? (
          <div className={`${ORGANIZATION_FEEDBACK_PANEL_CLASSNAME} space-y-3 p-6`}>
            <p className="text-sm text-slate-700 dark:text-white">
              Não foi possível carregar os dados da organização atual.
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
                  Os dados mais recentes da organização não puderam ser recarregados agora.
                </p>
              </div>
            ) : null}

            <OrganizationInfoPanel organization={organizationQuery.data} userEmail={userEmail} />

            <Dialog
              open={isEditDialogOpen}
              onOpenChange={handleEditDialogOpenChange}
              title="Editar organização"
              description="Atualize logo e plano da organização."
              contentClassName="flex max-h-[92dvh] w-[min(94vw,820px)] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 lg:max-h-none"
              bodyClassName="max-h-[calc(92dvh-4.5rem)] overflow-y-auto !px-4 !py-3 sm:!px-5 sm:!py-4 lg:max-h-none lg:overflow-visible"
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Dados editáveis da organização
                  </p>
                  <p className={ORGANIZATION_MUTED_CLASSNAME}>
                    Ajuste a identidade visual e o plano exibido para a organização atual.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.95fr)_minmax(280px,1.05fr)]">
                  <OrganizationLogoForm
                    organizationName={organizationQuery.data.name}
                    logoDraft={logoDraft}
                    logoUrl={organizationQuery.data.logo_url}
                    isSaving={isSavingLogo}
                    canSave={canSaveLogo}
                    editorVariant="inline"
                    onLogoDraftChange={setLogoDraft}
                    onSave={handleSaveLogo}
                    onRemove={handleRemoveLogo}
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
              </div>
            </Dialog>
          </div>
        ) : null}
      </div>
    </section>
  );
}

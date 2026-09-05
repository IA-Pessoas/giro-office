import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dialog } from "@shared/components/ui/Dialog";
import { Button } from "@shared/ui/newLayout/button";
import { Input } from "@shared/ui/newLayout/input";

import {
  useUpdatePlatformOrganizationLogo,
  useUpdatePlatformOrganizationPlan,
  useUpdatePlatformOrganizationStatus,
} from "../hooks/usePlatformOrganizationMutations";
import type {
  PlatformOrganization,
  PlatformOrganizationPlan,
  PlatformOrganizationStatus,
} from "../types";
import {
  getLogoUrlError,
  getPlatformMutationErrorMessage,
  isBlockingOrganizationStatus,
  PLATFORM_PLAN_LABELS,
  PLATFORM_STATUS_LABELS,
} from "../utils/platformManagement";

const STATUS_OPTIONS = Object.keys(PLATFORM_STATUS_LABELS) as PlatformOrganizationStatus[];
const PLAN_OPTIONS = Object.keys(PLATFORM_PLAN_LABELS) as PlatformOrganizationPlan[];
const FIELD_CLASSNAME =
  "mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

type Feedback = { kind: "success" | "error"; message: string } | null;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

function InlineFeedback({ feedback }: { feedback: Feedback }) {
  return feedback ? (
    <p
      className={
        feedback.kind === "success"
          ? "text-sm text-emerald-700 dark:text-emerald-300"
          : "text-sm text-rose-700 dark:text-rose-300"
      }
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  ) : null;
}

export function OrganizationOverviewPanel({
  organization,
}: {
  organization: PlatformOrganization;
}) {
  const statusMutation = useUpdatePlatformOrganizationStatus();
  const planMutation = useUpdatePlatformOrganizationPlan();
  const logoMutation = useUpdatePlatformOrganizationLogo();
  const [statusDraft, setStatusDraft] = useState(organization.status);
  const [planDraft, setPlanDraft] = useState(organization.subscription_plan);
  const [logoDraft, setLogoDraft] = useState(organization.logo_url ?? "");
  const [statusToConfirm, setStatusToConfirm] = useState<PlatformOrganizationStatus | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const statusSelectRef = useRef<HTMLSelectElement>(null);
  const planTriggerRef = useRef<HTMLButtonElement>(null);
  const logoTriggerRef = useRef<HTMLButtonElement>(null);
  const [statusFeedback, setStatusFeedback] = useState<Feedback>(null);
  const [planFeedback, setPlanFeedback] = useState<Feedback>(null);
  const [logoFeedback, setLogoFeedback] = useState<Feedback>(null);
  const requiresExactName = statusToConfirm === "suspended" || statusToConfirm === "cancelled";
  const statusConfirmationDisabled =
    statusMutation.isPending || (requiresExactName && confirmationName !== organization.name);

  useEffect(() => {
    setStatusDraft(organization.status);
  }, [organization.status]);

  useEffect(() => {
    setPlanDraft(organization.subscription_plan);
  }, [organization.subscription_plan]);

  useEffect(() => {
    setLogoDraft(organization.logo_url ?? "");
  }, [organization.logo_url]);

  const updateStatus = async (status: PlatformOrganizationStatus) => {
    setStatusFeedback(null);
    try {
      await statusMutation.mutateAsync({
        organizationId: organization.id,
        status,
        expectedUpdatedAt: organization.updated_at,
      });
      setStatusFeedback({ kind: "success", message: "Status atualizado." });
      setStatusToConfirm(null);
    } catch (error) {
      const message = getPlatformMutationErrorMessage(
        error,
        "Não foi possível atualizar o status.",
      );
      setStatusFeedback({ kind: "error", message });
      throw error;
    }
  };

  const handleStatusSave = () => {
    setConfirmationName("");
    setStatusFeedback(null);
    setStatusToConfirm(statusDraft);
  };

  const handlePlanSave = async () => {
    if (planMutation.isPending) return;

    setPlanFeedback(null);
    try {
      await planMutation.mutateAsync({
        organizationId: organization.id,
        subscriptionPlan: planDraft,
        expectedUpdatedAt: organization.updated_at,
      });
      setPlanFeedback({ kind: "success", message: "Plano atualizado." });
      setPlanDialogOpen(false);
    } catch (error) {
      setPlanFeedback({
        kind: "error",
        message: getPlatformMutationErrorMessage(error, "Não foi possível atualizar o plano."),
      });
    }
  };

  const handleLogoSave = async () => {
    if (logoMutation.isPending) return;

    setLogoFeedback(null);
    const validationError = getLogoUrlError(logoDraft);
    if (validationError) {
      setLogoFeedback({ kind: "error", message: validationError });
      return;
    }

    try {
      await logoMutation.mutateAsync({
        organizationId: organization.id,
        logoUrl: logoDraft.trim() || null,
        expectedUpdatedAt: organization.updated_at,
      });
      setLogoFeedback({
        kind: "success",
        message: logoDraft.trim() ? "URL do logo atualizada." : "URL do logo removida.",
      });
      setLogoDialogOpen(false);
    } catch (error) {
      setLogoFeedback({
        kind: "error",
        message: getPlatformMutationErrorMessage(error, "Não foi possível atualizar o logo."),
      });
    }
  };

  const openPlanDialog = () => {
    setPlanDraft(organization.subscription_plan);
    setPlanFeedback(null);
    setPlanDialogOpen(true);
  };

  const closePlanDialog = () => {
    if (planMutation.isPending) return;
    setPlanFeedback(null);
    setPlanDialogOpen(false);
  };

  const openLogoDialog = () => {
    setLogoDraft(organization.logo_url ?? "");
    setLogoFeedback(null);
    setLogoDialogOpen(true);
  };

  const closeLogoDialog = () => {
    if (logoMutation.isPending) return;
    setLogoFeedback(null);
    setLogoDialogOpen(false);
  };

  return (
    <section aria-labelledby="platform-overview-title" className="p-4 sm:p-5">
      <h2
        className="text-lg font-semibold text-slate-950 dark:text-white"
        id="platform-overview-title"
      >
        Visão geral
      </h2>

      <dl className="mt-4 grid gap-x-6 gap-y-4 border-b border-slate-200 pb-5 sm:grid-cols-2 dark:border-slate-800">
        <div>
          <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Nome</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
            {organization.name}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">CNPJ</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
            {organization.cnpj}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Slug</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
            {organization.slug}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">Criada em</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
            {formatDate(organization.created_at)}
          </dd>
        </div>
      </dl>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        <section className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)]">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Status</h3>
            <p className="mt-1 max-w-prose text-sm text-slate-600 dark:text-slate-300">
              Em atraso, suspensa e cancelada bloqueiam a autenticação dos usuários da organização.
            </p>
          </div>
          <div>
            <label
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
              htmlFor="platform-status"
            >
              Novo status
            </label>
            <select
              className={FIELD_CLASSNAME}
              disabled={statusMutation.isPending}
              id="platform-status"
              ref={statusSelectRef}
              onChange={(event) => {
                setStatusDraft(event.target.value as PlatformOrganizationStatus);
                setStatusFeedback(null);
              }}
              value={statusDraft}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {PLATFORM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                disabled={statusMutation.isPending || statusDraft === organization.status}
                onClick={handleStatusSave}
                size="sm"
                type="button"
              >
                {statusMutation.isPending ? "Salvando..." : "Salvar status"}
              </Button>
              <InlineFeedback feedback={statusFeedback} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)]">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Plano</h3>
            <p className="mt-1 max-w-prose text-sm text-slate-600 dark:text-slate-300">
              Define o plano comercial registrado para a organização.
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Plano atual: {PLATFORM_PLAN_LABELS[organization.subscription_plan]}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button asChild size="sm">
                <button onClick={openPlanDialog} ref={planTriggerRef} type="button">
                  Editar plano
                </button>
              </Button>
              <InlineFeedback feedback={planFeedback} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)]">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">URL do logo</h3>
            <p className="mt-1 max-w-prose text-sm text-slate-600 dark:text-slate-300">
              O Office armazena somente o endereço HTTPS; esta tela não carrega a imagem externa.
            </p>
            {organization.logo_url && !getLogoUrlError(organization.logo_url) ? (
              <a
                className="mt-2 inline-flex max-w-full items-center gap-1 text-sm font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300"
                href={organization.logo_url}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span className="truncate">Abrir URL atual</span>
                <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
              </a>
            ) : null}
          </div>
          <div>
            <p className="break-all text-sm text-slate-700 dark:text-slate-200">
              URL atual: {organization.logo_url ?? "Não definida"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button asChild size="sm">
                <button onClick={openLogoDialog} ref={logoTriggerRef} type="button">
                  Editar logo
                </button>
              </Button>
              <InlineFeedback feedback={logoFeedback} />
            </div>
          </div>
        </section>
      </div>

      <Dialog
        contentClassName="!w-[min(92vw,440px)]"
        description={
          statusToConfirm
            ? `Alterar o status de ${organization.name} para ${PLATFORM_STATUS_LABELS[statusToConfirm]}.`
            : "Confirme a alteração do status da organização."
        }
        footer={
          <>
            <Button
              disabled={statusMutation.isPending}
              onClick={() => setStatusToConfirm(null)}
              type="button"
              variant="outline"
            >
              Manter status
            </Button>
            <Button
              disabled={statusConfirmationDisabled}
              onClick={() => {
                if (!statusToConfirm || statusConfirmationDisabled) return;
                void updateStatus(statusToConfirm).catch(() => undefined);
              }}
              type="button"
              variant={
                statusToConfirm && isBlockingOrganizationStatus(statusToConfirm)
                  ? "destructive"
                  : "default"
              }
            >
              {statusMutation.isPending ? "Salvando..." : "Alterar status"}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setStatusToConfirm(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          statusSelectRef.current?.focus();
        }}
        open={Boolean(statusToConfirm)}
        preventClose={statusMutation.isPending}
        title="Confirmar alteração de status"
      >
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            Alterar {organization.name} para{" "}
            {statusToConfirm ? PLATFORM_STATUS_LABELS[statusToConfirm] : ""}?
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {statusToConfirm && isBlockingOrganizationStatus(statusToConfirm)
              ? "Este status bloqueará a autenticação dos usuários da organização."
              : "Este status permite a autenticação dos usuários da organização."}
          </p>
          {requiresExactName ? (
            <div>
              <label
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
                htmlFor="platform-status-confirmation-name"
              >
                Nome exato da organização
              </label>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Digite {organization.name} para confirmar.
              </p>
              <Input
                autoComplete="off"
                className="mt-1.5 bg-white dark:bg-slate-950"
                disabled={statusMutation.isPending}
                id="platform-status-confirmation-name"
                onChange={(event) => setConfirmationName(event.target.value)}
                value={confirmationName}
              />
            </div>
          ) : null}
          <InlineFeedback feedback={statusFeedback?.kind === "error" ? statusFeedback : null} />
        </div>
      </Dialog>

      <Dialog
        contentClassName="!w-[min(92vw,440px)]"
        description="Selecione o plano comercial da organização."
        footer={
          <>
            <Button
              disabled={planMutation.isPending}
              onClick={closePlanDialog}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={planMutation.isPending || planDraft === organization.subscription_plan}
              onClick={() => void handlePlanSave()}
              type="button"
            >
              {planMutation.isPending ? "Salvando..." : "Salvar plano"}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closePlanDialog();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          planTriggerRef.current?.focus();
        }}
        open={planDialogOpen}
        preventClose={planMutation.isPending}
        title="Editar plano"
      >
        <div className="space-y-4">
          <div>
            <label
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
              htmlFor="platform-plan"
            >
              Plano
            </label>
            <select
              className={FIELD_CLASSNAME}
              disabled={planMutation.isPending}
              id="platform-plan"
              onChange={(event) => {
                setPlanDraft(event.target.value as PlatformOrganizationPlan);
                setPlanFeedback(null);
              }}
              value={planDraft}
            >
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan} value={plan}>
                  {PLATFORM_PLAN_LABELS[plan]}
                </option>
              ))}
            </select>
          </div>
          <InlineFeedback feedback={planFeedback?.kind === "error" ? planFeedback : null} />
        </div>
      </Dialog>

      <Dialog
        contentClassName="!w-[min(92vw,440px)]"
        description="Informe o endereço HTTPS do logo da organização."
        footer={
          <>
            <Button
              disabled={logoMutation.isPending}
              onClick={closeLogoDialog}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={
                logoMutation.isPending || logoDraft.trim() === (organization.logo_url ?? "")
              }
              onClick={() => void handleLogoSave()}
              type="button"
            >
              {logoMutation.isPending ? "Salvando..." : "Salvar logo"}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeLogoDialog();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          logoTriggerRef.current?.focus();
        }}
        open={logoDialogOpen}
        preventClose={logoMutation.isPending}
        title="Editar logo"
      >
        <div className="space-y-4">
          <div>
            <label
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
              htmlFor="platform-logo-url"
            >
              URL HTTPS
            </label>
            <Input
              className="mt-1.5 bg-white dark:bg-slate-950"
              disabled={logoMutation.isPending}
              id="platform-logo-url"
              maxLength={2_048}
              onChange={(event) => {
                setLogoDraft(event.target.value);
                setLogoFeedback(null);
              }}
              placeholder="https://exemplo.com/logo.png"
              type="url"
              value={logoDraft}
            />
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
              Deixe em branco para limpar.
            </p>
          </div>
          <InlineFeedback feedback={logoFeedback?.kind === "error" ? logoFeedback : null} />
        </div>
      </Dialog>
    </section>
  );
}

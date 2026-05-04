import { BadgeCheck, Save } from "lucide-react";

import type { OrganizationPlanOption } from "../utils/organizationUi";
import { getOrganizationPlanLabel, ORGANIZATION_PLAN_OPTIONS } from "../utils/organizationUi";

const ORGANIZATION_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_LABEL_CLASSNAME =
  "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const ORGANIZATION_SELECT_CLASSNAME =
  "w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

interface OrganizationPlanFormProps {
  currentPlan: string;
  planDraft: OrganizationPlanOption;
  isSaving: boolean;
  canSave: boolean;
  onPlanDraftChange: (nextValue: OrganizationPlanOption) => void;
  onSave: () => void;
}

export function OrganizationPlanForm({
  currentPlan,
  planDraft,
  isSaving,
  canSave,
  onPlanDraftChange,
  onSave,
}: OrganizationPlanFormProps) {
  return (
    <div className={`${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-4 p-5`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Plano de assinatura</h3>
        </div>
        <p className={ORGANIZATION_MUTED_CLASSNAME}>Atualize o plano exibido.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className={ORGANIZATION_MUTED_CLASSNAME}>Plano atual</p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            {getOrganizationPlanLabel(currentPlan)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className={ORGANIZATION_MUTED_CLASSNAME}>Novo plano</p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            {getOrganizationPlanLabel(planDraft)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className={ORGANIZATION_LABEL_CLASSNAME} htmlFor="organization-plan">
          Selecionar Plano
        </label>
        <select
          id="organization-plan"
          value={planDraft}
          onChange={(event) => onPlanDraftChange(event.target.value as OrganizationPlanOption)}
          className={ORGANIZATION_SELECT_CLASSNAME}
          disabled={isSaving}
        >
          {ORGANIZATION_PLAN_OPTIONS.map((planOption) => (
            <option key={planOption} value={planOption}>
              {getOrganizationPlanLabel(planOption)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
        disabled={!canSave}
      >
        <Save className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""}`} />
        {isSaving ? "Salvando..." : "Salvar plano"}
      </button>
    </div>
  );
}

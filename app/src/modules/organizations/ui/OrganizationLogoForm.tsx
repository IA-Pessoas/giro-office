import { ImageIcon, Save, X } from "lucide-react";

import { resolvePhotoUrl } from "@shared/utils";

const ORGANIZATION_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_LABEL_CLASSNAME =
  "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const ORGANIZATION_INPUT_CLASSNAME =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80 dark:disabled:bg-slate-800";

interface OrganizationLogoFormProps {
  organizationName: string;
  logoDraft: string;
  logoUrl: string | null;
  onLogoDraftChange: (nextValue: string) => void;
}

export function OrganizationLogoForm({
  organizationName,
  logoDraft,
  logoUrl,
  onLogoDraftChange,
}: OrganizationLogoFormProps) {
  const resolvedLogoUrl = resolvePhotoUrl(logoUrl);
  const resolvedLogoDraftUrl = resolvePhotoUrl(logoDraft.trim() || null);

  return (
    <div className={`${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-4 p-5`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Logo da organizacao</h3>
        </div>
        <p className={ORGANIZATION_MUTED_CLASSNAME}>Informe a URL da imagem para atualizar a logo.</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {resolvedLogoDraftUrl || resolvedLogoUrl ? (
            <img
              src={resolvedLogoDraftUrl ?? resolvedLogoUrl ?? undefined}
              alt={`Logo de ${organizationName}`}
              className="h-full w-full object-contain p-3"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-3 text-center">
              <ImageIcon className="h-5 w-5 text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma logo configurada.</p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-2">
            <label className={ORGANIZATION_LABEL_CLASSNAME} htmlFor="organization-logo-url">
              URL da logo
            </label>
            <input
              id="organization-logo-url"
              type="text"
              value={logoDraft}
              onChange={(event) => onLogoDraftChange(event.target.value)}
              placeholder="https://exemplo.com/logo.png"
              className={ORGANIZATION_INPUT_CLASSNAME}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white opacity-70"
              disabled
            >
              <Save className="h-4 w-4" />
              Salvar
            </button>

            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

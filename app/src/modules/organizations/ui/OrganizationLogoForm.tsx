import { useState } from "react";
import { ImageIcon, Save, Trash2, Upload } from "lucide-react";

import { ConfirmationDialog, Dialog } from "@shared/components";
import { resolvePhotoUrl } from "@shared/utils";

const ORGANIZATION_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ORGANIZATION_LABEL_CLASSNAME =
  "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const ORGANIZATION_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const ORGANIZATION_INPUT_CLASSNAME =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80 dark:disabled:bg-slate-800";

const SECONDARY_BUTTON_CLASSNAME =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-opacity disabled:cursor-not-allowed disabled:opacity-70";

interface OrganizationLogoFormProps {
  organizationName: string;
  logoDraft: string;
  logoUrl: string | null;
  isSaving: boolean;
  canSave: boolean;
  editorVariant?: "dialog" | "inline";
  onLogoDraftChange: (nextValue: string) => void;
  onSave: () => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onCancel: () => void;
}

export function OrganizationLogoForm({
  organizationName,
  logoDraft,
  logoUrl,
  isSaving,
  canSave,
  editorVariant = "dialog",
  onLogoDraftChange,
  onSave,
  onRemove,
  onCancel,
}: OrganizationLogoFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const resolvedLogoUrl = resolvePhotoUrl(logoUrl);
  const resolvedLogoDraftUrl = resolvePhotoUrl(logoDraft.trim() || null);
  const previewUrl = resolvedLogoDraftUrl ?? resolvedLogoUrl;
  const hasConfiguredLogo = Boolean(resolvedLogoUrl);
  const shouldRenderInlineEditor = editorVariant === "inline";
  const panelClassName = shouldRenderInlineEditor
    ? `${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-3 p-4`
    : `${ORGANIZATION_SUBPANEL_CLASSNAME} space-y-4 p-5`;
  const previewSectionClassName = shouldRenderInlineEditor
    ? "flex flex-col items-center justify-center gap-3 text-center"
    : "flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between";
  const previewContainerClassName = shouldRenderInlineEditor
    ? "mx-auto flex w-full max-w-[180px] flex-col items-center gap-2 text-center"
    : "flex w-fit flex-col items-start gap-3";
  const previewFrameClassName = shouldRenderInlineEditor
    ? "flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
    : "flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);

    if (!open) {
      onCancel();
    }
  };

  const handleSave = async () => {
    const saved = await onSave();

    if (saved && editorVariant === "dialog") {
      setIsDialogOpen(false);
    }
  };

  const handleRemove = async () => {
    const removed = await onRemove();

    if (!removed) {
      // Mantém a confirmação aberta com o erro genérico do diálogo.
      throw new Error("Falha ao remover a logo.");
    }

    setIsDialogOpen(false);
  };

  return (
    <div className={panelClassName}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-[var(--colors-brand-gradient-end)]" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Logo da organização</h3>
        </div>
        <p className={ORGANIZATION_MUTED_CLASSNAME}>Atualize a logo da organização.</p>
      </div>

      <div className={previewSectionClassName}>
        <div className={previewContainerClassName}>
          <div className={previewFrameClassName}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Logo de ${organizationName}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain p-4"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <ImageIcon className="h-6 w-6 text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Sem logo.</p>
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            {previewUrl ? "Logo configurada." : "Nenhuma logo definida."}
          </p>
        </div>

        {shouldRenderInlineEditor ? null : (
          <div className="flex w-full flex-col gap-3 sm:w-[240px] sm:flex-shrink-0 sm:items-end">
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className={SECONDARY_BUTTON_CLASSNAME}
              disabled={isSaving}
            >
              <Upload className="h-4 w-4" />
              Alterar logo
            </button>

            {hasConfiguredLogo ? (
              <button
                type="button"
                onClick={() => setIsRemoveConfirmOpen(true)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                disabled={isSaving}
              >
                <Trash2 className="h-4 w-4" />
                Remover logo
              </button>
            ) : null}
          </div>
        )}
      </div>

      {shouldRenderInlineEditor ? (
        <div className="space-y-3">
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
              disabled={isSaving}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              className={PRIMARY_BUTTON_CLASSNAME}
              disabled={!canSave}
            >
              <Save className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""}`} />
              {isSaving ? "Salvando..." : "Salvar logo"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={SECONDARY_BUTTON_CLASSNAME}
              disabled={isSaving || !canSave}
            >
              Cancelar alterações
            </button>
          </div>

          {hasConfiguredLogo ? (
            <button
              type="button"
              onClick={() => setIsRemoveConfirmOpen(true)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
              disabled={isSaving}
            >
              <Trash2 className="h-4 w-4" />
              Remover logo
            </button>
          ) : null}
        </div>
      ) : (
        <Dialog
          open={isDialogOpen}
          onOpenChange={handleOpenChange}
          title="Alterar logo"
          description="Cole a URL da logo da organização."
          contentClassName="border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          footer={(
            <>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className={PRIMARY_BUTTON_CLASSNAME}
                disabled={!canSave}
              >
                <Save className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""}`} />
                {isSaving ? "Salvando..." : "Salvar logo"}
              </button>
            </>
          )}
        >
          <div className="space-y-4">
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
                disabled={isSaving}
              />
            </div>
            <p className={ORGANIZATION_MUTED_CLASSNAME}>Use o endereço direto da imagem.</p>
          </div>
        </Dialog>
      )}

      <ConfirmationDialog
        open={isRemoveConfirmOpen}
        onOpenChange={setIsRemoveConfirmOpen}
        title="Remover logo"
        description={`Remover a logo da organização ${organizationName}?`}
        onConfirm={handleRemove}
        isConfirming={isSaving}
        errorMessage={null}
        confirmLabel="Remover logo"
        cancelLabel="Cancelar"
      />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Camera,
  KeyRound,
  LoaderCircle,
  Moon,
  Palette,
  Save,
  Settings,
  Shield,
  SquareCheck,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "react-toastify";

import { useAuth } from "@/context/AuthContext";
import {
  canCreateOrganizationOwner,
  canCreateUsers,
  isOrganizationOwner,
  useModuleAccess,
} from "@modules/auth";
import {
  TASK_MODEL_CONFIG_ENTRY,
  canManageTaskModelConfig,
  canViewTaskModelConfig,
} from "@modules/integracao";
import { MyOrganizationSection } from "@modules/organizations";
import { Dialog } from "@shared/components";
import { useDeleteMePhoto, useMe, useUpdateMe, useUploadMePhoto } from "@shared/hooks";
import { resolvePhotoUrl } from "@shared/utils";
import { buildSelfProfileUpdatePayload, selfPasswordError } from "@shared/utils/meProfileUpdate";

const SETTINGS_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const SETTINGS_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

const SETTINGS_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const SETTINGS_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_LABEL_CLASSNAME =
  "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const SETTINGS_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const SETTINGS_INPUT_CLASSNAME =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80 dark:disabled:bg-slate-800";

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

const PERMISSION_LABELS: Record<number, string> = {
  0: "Visualizador",
  1: "Usuário",
  2: "Administrador",
};

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "ME"
  );
}

function applyTheme(nextTheme: "light" | "dark"): void {
  if (typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.classList.remove("light", "dark");
  root.classList.add(nextTheme);
  root.setAttribute("data-theme", nextTheme);

  localStorage.setItem("workspace-theme", nextTheme);
  localStorage.setItem("chakra-ui-color-mode", nextTheme);
}

export function Configuracoes() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const meQuery = useMe();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const updateMeMutation = useUpdateMe();
  const uploadPhotoMutation = useUploadMePhoto();
  const deletePhotoMutation = useDeleteMePhoto();

  const [isDark, setIsDark] = useState(false);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null);
  const [hasPhotoLoadError, setHasPhotoLoadError] = useState(false);

  function clearPasswordDraft() {
    setPassword("");
    setCurrentPassword("");
    setConfirmPassword("");
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const htmlTheme = document.documentElement.getAttribute("data-theme");
    setIsDark(htmlTheme === "dark" || document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!meQuery.data) {
      return;
    }

    setName(meQuery.data.name);
    clearPasswordDraft();
  }, [meQuery.data]);

  useEffect(() => {
    return () => {
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl);
      }
    };
  }, [pendingPhotoPreviewUrl]);

  const currentName = meQuery.data?.name ?? "";
  const currentLogin = meQuery.data?.login ?? "";
  const currentPhotoUrl = meQuery.data?.photo_url ?? null;
  const canManageUsers = canCreateUsers(user);
  const currentPermissionLabel = isOrganizationOwner(meQuery.data)
    ? "Owner"
    : (PERMISSION_LABELS[meQuery.data?.permission ?? 0] ?? "Usuário");
  const managedOrganizationId =
    canCreateOrganizationOwner(meQuery.data) && meQuery.data.organization_id
      ? meQuery.data.organization_id
      : null;
  const canManageTaskModels = canManageTaskModelConfig(integracaoAccess);
  const canViewTaskModels = canViewTaskModelConfig(integracaoAccess);
  const resolvedCurrentPhotoUrl = resolvePhotoUrl(currentPhotoUrl);

  const displayedAvatar = pendingPhotoPreviewUrl ?? resolvedCurrentPhotoUrl;
  const initials = useMemo(
    () => getInitials(name.trim() || currentName || "Meu Perfil"),
    [currentName, name],
  );

  const hasPendingPhotoChanges = pendingPhotoFile !== null;
  const passwordDraft = { password, currentPassword, confirmPassword };
  const passwordError = selfPasswordError(passwordDraft);
  const accessUpdatePayload = meQuery.data
    ? buildSelfProfileUpdatePayload({
        canManageUsers,
        currentName,
        name,
        ...passwordDraft,
      })
    : null;

  const isSaving =
    updateMeMutation.isPending || uploadPhotoMutation.isPending || deletePhotoMutation.isPending;

  const canSavePhoto = Boolean(meQuery.data) && !isSaving && hasPendingPhotoChanges;
  const canSaveAccessData = Boolean(accessUpdatePayload) && !isSaving;

  useEffect(() => {
    setHasPhotoLoadError(false);
  }, [displayedAvatar]);

  const handleToggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    setIsDark(nextTheme === "dark");
  };

  const clearPendingPhoto = () => {
    if (pendingPhotoPreviewUrl) {
      URL.revokeObjectURL(pendingPhotoPreviewUrl);
    }

    setPendingPhotoFile(null);
    setPendingPhotoPreviewUrl(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isSaving) {
      event.target.value = "";
      return;
    }

    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (
      !ACCEPTED_PHOTO_TYPES.includes(selectedFile.type as (typeof ACCEPTED_PHOTO_TYPES)[number])
    ) {
      toast.error("Use uma imagem JPEG, PNG ou WebP.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    if (pendingPhotoPreviewUrl) {
      URL.revokeObjectURL(pendingPhotoPreviewUrl);
    }

    setPendingPhotoFile(selectedFile);
    setPendingPhotoPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const resetAccessDraft = () => {
    setName(currentName);
    clearPasswordDraft();
  };

  const handleAccessDialogOpenChange = (open: boolean) => {
    setIsAccessDialogOpen(open);

    if (!open && !isSaving) {
      resetAccessDraft();
    }
  };

  const handleSaveAccessData = async () => {
    if (!meQuery.data || !canSaveAccessData) {
      return;
    }

    try {
      await updateMeMutation.mutateAsync(accessUpdatePayload);
      clearPasswordDraft();
      setIsAccessDialogOpen(false);
    } catch {
      // Toasts are handled by the mutation hook.
    }
  };

  const handlePhotoSecondaryAction = async () => {
    if (pendingPhotoFile) {
      clearPendingPhoto();
      return;
    }

    if (!currentPhotoUrl) {
      return;
    }

    try {
      await deletePhotoMutation.mutateAsync();
    } catch {
      // Toasts are handled by the mutation hook.
    }
  };

  const handleSavePhoto = async () => {
    if (!meQuery.data || !pendingPhotoFile) {
      return;
    }

    try {
      await uploadPhotoMutation.mutateAsync(pendingPhotoFile);
      clearPendingPhoto();
    } catch {
      // Toasts are handled by the mutation hook.
    }
  };

  if (meQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Configurações</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Carregando preferências e dados do perfil...
          </p>
        </div>

        <div className={`${SETTINGS_FEEDBACK_PANEL_CLASSNAME} flex items-center gap-3 p-6`}>
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--colors-brand-gradient-end)]" />
          <p className={SETTINGS_MUTED_CLASSNAME}>Carregando dados do usuário atual.</p>
        </div>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Configurações</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Não foi possível carregar os dados do perfil.
          </p>
        </div>

        <div className={`${SETTINGS_FEEDBACK_PANEL_CLASSNAME} space-y-3 p-6`}>
          <p className="text-sm text-slate-700 dark:text-white">
            A leitura do usuário autenticado falhou. Tente carregar novamente.
          </p>
          <button
            type="button"
            onClick={() => void meQuery.refetch()}
            className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${SETTINGS_GRADIENT_ICON_CLASSNAME}`}
            >
              <Settings className="h-6 w-6 text-white" />
            </div>
            Configurações
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gerencie seu perfil e as preferências visuais da aplicação.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <section className={`${SETTINGS_PANEL_CLASSNAME} p-6 lg:p-8`}>
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Perfil</h2>
              </div>
              <p className={SETTINGS_MUTED_CLASSNAME}>Atualize sua foto e seus dados de acesso.</p>
            </div>

            <div className={`${SETTINGS_SUBPANEL_CLASSNAME} space-y-5 p-5`}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    {displayedAvatar && !hasPhotoLoadError ? (
                      <img
                        src={displayedAvatar}
                        alt={`Foto de ${currentName}`}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={() => setHasPhotoLoadError(true)}
                      />
                    ) : (
                      <span className="text-2xl font-semibold text-slate-700 dark:text-slate-100">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                          {currentName}
                        </p>
                        <span className="inline-flex w-fit rounded-full bg-[var(--colors-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                          {currentPermissionLabel}
                        </span>
                      </div>
                      <p className={`truncate ${SETTINGS_MUTED_CLASSNAME}`}>{currentLogin}</p>
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 lg:w-[240px] lg:flex-shrink-0 lg:items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleSelectPhoto}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    disabled={isSaving}
                  >
                    {pendingPhotoFile ? (
                      <Camera className="h-4 w-4" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {pendingPhotoFile ? "Trocar foto" : "Escolher foto"}
                  </button>

                  {pendingPhotoFile ? (
                    <button
                      type="button"
                      onClick={() => void handleSavePhoto()}
                      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${SETTINGS_GRADIENT_BUTTON_CLASSNAME}`}
                      disabled={!canSavePhoto}
                    >
                      {uploadPhotoMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {uploadPhotoMutation.isPending ? "Salvando..." : "Salvar foto"}
                    </button>
                  ) : null}

                  {pendingPhotoFile || currentPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() => void handlePhotoSecondaryAction()}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                      disabled={isSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                      {pendingPhotoFile ? "Descartar foto" : "Remover foto"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setIsAccessDialogOpen(true)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <KeyRound className="h-4 w-4" />
                    Editar dados de acesso
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                JPEG, PNG ou WebP. máx. 5 MB
              </p>

              <Dialog
                open={isAccessDialogOpen}
                onOpenChange={handleAccessDialogOpenChange}
                title="Editar dados de acesso"
                description="Atualize o nome exibido e a senha da sua conta."
                contentClassName="flex max-h-[92dvh] w-[min(94vw,560px)] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                bodyClassName="max-h-[calc(92dvh-4.5rem)] overflow-y-auto !px-4 !py-4 sm:!px-5"
                footer={
                  <>
                    <button
                      type="button"
                      onClick={() => handleAccessDialogOpenChange(false)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      disabled={isSaving}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveAccessData()}
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white ${SETTINGS_GRADIENT_BUTTON_CLASSNAME}`}
                      disabled={!canSaveAccessData}
                    >
                      {updateMeMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {updateMeMutation.isPending ? "Salvando..." : "Salvar dados"}
                    </button>
                  </>
                }
              >
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {currentLogin}
                      </p>
                      <p className={SETTINGS_MUTED_CLASSNAME}>
                        Permissão atual: {currentPermissionLabel}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className={SETTINGS_LABEL_CLASSNAME} htmlFor="settings-access-name">
                        Nome
                      </label>
                      <input
                        id="settings-access-name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Digite o nome exibido no sistema"
                        className={SETTINGS_INPUT_CLASSNAME}
                        disabled={isSaving || !canManageUsers}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        className={SETTINGS_LABEL_CLASSNAME}
                        htmlFor="settings-access-current-password"
                      >
                        Senha atual
                      </label>
                      <input
                        id="settings-access-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder="Necessária para trocar a senha"
                        autoComplete="current-password"
                        className={SETTINGS_INPUT_CLASSNAME}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        className={SETTINGS_LABEL_CLASSNAME}
                        htmlFor="settings-access-password"
                      >
                        Nova senha
                      </label>
                      <input
                        id="settings-access-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Deixe em branco para manter a senha atual"
                        autoComplete="new-password"
                        className={SETTINGS_INPUT_CLASSNAME}
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        className={SETTINGS_LABEL_CLASSNAME}
                        htmlFor="settings-access-confirm-password"
                      >
                        Confirmar nova senha
                      </label>
                      <input
                        id="settings-access-confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repita a nova senha"
                        autoComplete="new-password"
                        className={SETTINGS_INPUT_CLASSNAME}
                        disabled={isSaving}
                        aria-describedby={
                          passwordError ? "settings-access-password-error" : undefined
                        }
                      />
                      {passwordError ? (
                        <p
                          id="settings-access-password-error"
                          className="text-sm text-red-600 dark:text-red-400"
                        >
                          {passwordError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Dialog>
            </div>
          </div>
        </section>

        {managedOrganizationId ? (
          <MyOrganizationSection organizationId={managedOrganizationId} userEmail={currentLogin} />
        ) : null}

        {canViewTaskModels ? (
          <section className={`${SETTINGS_PANEL_CLASSNAME} p-6 lg:p-8`}>
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <SquareCheck className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Integração
                  </h2>
                </div>
                <p className={SETTINGS_MUTED_CLASSNAME}>
                  Ajustes usados pelos fluxos de tarefas e projetos.
                </p>
              </div>

              <Link
                href={TASK_MODEL_CONFIG_ENTRY.href}
                className={`${SETTINGS_SUBPANEL_CLASSNAME} flex flex-col gap-4 p-4 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    <SquareCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {TASK_MODEL_CONFIG_ENTRY.label}
                    </p>
                    <p className={SETTINGS_MUTED_CLASSNAME}>
                      {canManageTaskModels
                        ? TASK_MODEL_CONFIG_ENTRY.description
                        : "Consulte os modelos usados na criação das tarefas de integração."}
                    </p>
                  </div>
                </div>
                <span className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  Abrir
                </span>
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <section className={`${SETTINGS_PANEL_CLASSNAME} p-6`}>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tema</h2>
                </div>
                <p className={SETTINGS_MUTED_CLASSNAME}>Escolha o visual da interface.</p>
              </div>

              <div
                className={`${SETTINGS_SUBPANEL_CLASSNAME} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Modo escuro
                    </p>
                    <p className={SETTINGS_MUTED_CLASSNAME}>{isDark ? "Ativado" : "Desativado"}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    isDark ? "bg-[var(--colors-brand-gradient-end)]" : "bg-slate-300"
                  }`}
                  aria-label="Alternar tema"
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      isDark ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          <section className={`${SETTINGS_PANEL_CLASSNAME} p-6`}>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Segurança
                  </h2>
                </div>
                <p className={SETTINGS_MUTED_CLASSNAME}>Recursos extras de proteção da conta.</p>
              </div>

              <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex items-start gap-3 p-4`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Autenticação de dois fatores
                  </p>
                  <p className={SETTINGS_MUTED_CLASSNAME}>Em breve.</p>
                </div>
              </div>
            </div>
          </section>

          <section className={`${SETTINGS_PANEL_CLASSNAME} p-6`}>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Notificações
                  </h2>
                </div>
                <p className={SETTINGS_MUTED_CLASSNAME}>Alertas e avisos por e-mail.</p>
              </div>

              <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex items-start gap-3 p-4`}>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Notificações
                  </p>
                  <p className={SETTINGS_MUTED_CLASSNAME}>Em breve.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

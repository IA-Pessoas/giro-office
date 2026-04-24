import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  LoaderCircle,
  Moon,
  Palette,
  Save,
  Settings,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "react-toastify";

import { useDeleteMePhoto, useMe, useUpdateMe, useUploadMePhoto } from "@shared/hooks";

const SETTINGS_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const SETTINGS_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

const SETTINGS_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const SETTINGS_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_LABEL_CLASSNAME =
  "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const SETTINGS_TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";

const SETTINGS_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const SETTINGS_INPUT_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80 dark:disabled:bg-slate-800";

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

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
  const meQuery = useMe();
  const updateMeMutation = useUpdateMe();
  const uploadPhotoMutation = useUploadMePhoto();
  const deletePhotoMutation = useDeleteMePhoto();

  const [isDark, setIsDark] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null);

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
    setPassword("");
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

  const displayedAvatar = pendingPhotoPreviewUrl ?? currentPhotoUrl;
  const initials = useMemo(
    () => getInitials(name.trim() || currentName || "Meu Perfil"),
    [currentName, name],
  );

  const hasPendingProfileChanges =
    Boolean(meQuery.data) &&
    (name.trim() !== currentName || password.trim().length > 0 || pendingPhotoFile !== null);

  const isSaving =
    updateMeMutation.isPending || uploadPhotoMutation.isPending || deletePhotoMutation.isPending;

  const canSave =
    Boolean(meQuery.data) &&
    !isSaving &&
    name.trim().length > 0 &&
    hasPendingProfileChanges;

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
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!ACCEPTED_PHOTO_TYPES.includes(selectedFile.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
      toast.error("Use uma imagem JPEG, PNG ou WebP.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error("A imagem deve ter no maximo 5 MB.");
      event.target.value = "";
      return;
    }

    if (pendingPhotoPreviewUrl) {
      URL.revokeObjectURL(pendingPhotoPreviewUrl);
    }

    setPendingPhotoFile(selectedFile);
    setPendingPhotoPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleSaveProfile = async () => {
    if (!meQuery.data) {
      return;
    }

    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      toast.error("Informe um nome para salvar o perfil.");
      return;
    }

    try {
      if (trimmedName !== currentName || password.trim().length > 0) {
        await updateMeMutation.mutateAsync({
          name: trimmedName,
          ...(password.trim() ? { password: password.trim() } : {}),
        });
      }

      if (pendingPhotoFile) {
        await uploadPhotoMutation.mutateAsync(pendingPhotoFile);
        clearPendingPhoto();
      }

      setPassword("");
    } catch {
      // Toasts are handled by the mutation hooks.
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

  if (meQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Configuracoes</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Carregando preferencias e dados do perfil...
          </p>
        </div>

        <div className={`${SETTINGS_FEEDBACK_PANEL_CLASSNAME} flex items-center gap-3 p-6`}>
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--colors-brand-gradient-end)]" />
          <p className={SETTINGS_MUTED_CLASSNAME}>Carregando dados do usuario atual.</p>
        </div>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Configuracoes</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Nao foi possivel carregar os dados do perfil.
          </p>
        </div>

        <div className={`${SETTINGS_FEEDBACK_PANEL_CLASSNAME} space-y-3 p-6`}>
          <p className={SETTINGS_TEXT_CLASSNAME}>
            A leitura do usuario autenticado falhou. Tente carregar novamente.
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
            Configuracoes
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gerencie seu perfil e as preferencias visuais da aplicacao.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSaveProfile()}
          className={`inline-flex w-fit items-center gap-2 self-end rounded-xl px-4 py-2.5 text-sm font-semibold text-white lg:self-auto ${SETTINGS_GRADIENT_BUTTON_CLASSNAME}`}
          disabled={!canSave}
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Salvando..." : "Salvar alteracoes"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className={`${SETTINGS_PANEL_CLASSNAME} p-6 lg:p-8`}>
          <div className="space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Perfil</h2>
              </div>
              <p className={SETTINGS_MUTED_CLASSNAME}>
                Esses dados sao lidos de <code className="font-mono">GET /user/me</code> e salvos
                usando o fluxo atual do backend.
              </p>
            </div>

            <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                  {displayedAvatar ? (
                    <img
                      src={displayedAvatar}
                      alt={`Foto de ${currentName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-semibold text-slate-700 dark:text-slate-100">
                      {initials}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900 dark:text-white">{currentName}</p>
                  <p className={SETTINGS_MUTED_CLASSNAME}>{currentLogin}</p>
                  <p className={SETTINGS_MUTED_CLASSNAME}>
                    Formatos aceitos: JPEG, PNG ou WebP. Tamanho maximo: 5 MB.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={isSaving}
                >
                  {pendingPhotoFile ? <Camera className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  {pendingPhotoFile ? "Trocar selecao" : "Escolher foto"}
                </button>

                {(pendingPhotoFile || currentPhotoUrl) ? (
                  <button
                    type="button"
                    onClick={() => void handlePhotoSecondaryAction()}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                    {pendingPhotoFile ? "Descartar selecao" : "Remover foto"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className={SETTINGS_LABEL_CLASSNAME} htmlFor="settings-login">
                  Login
                </label>
                <input
                  id="settings-login"
                  type="text"
                  value={currentLogin}
                  className={SETTINGS_INPUT_CLASSNAME}
                  disabled
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label className={SETTINGS_LABEL_CLASSNAME} htmlFor="settings-permission">
                  Nivel de permissao
                </label>
                <input
                  id="settings-permission"
                  type="text"
                  value={String(meQuery.data.permission)}
                  className={SETTINGS_INPUT_CLASSNAME}
                  disabled
                  readOnly
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className={SETTINGS_LABEL_CLASSNAME} htmlFor="settings-name">
                  Nome
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Digite o nome exibido no sistema"
                  className={SETTINGS_INPUT_CLASSNAME}
                  disabled={isSaving}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className={SETTINGS_LABEL_CLASSNAME} htmlFor="settings-password">
                  Nova senha
                </label>
                <input
                  id="settings-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  autoComplete="new-password"
                  className={SETTINGS_INPUT_CLASSNAME}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div>
                <p className={SETTINGS_TEXT_CLASSNAME}>
                  {hasPendingProfileChanges
                    ? "Existem alteracoes pendentes para salvar."
                    : "Seu perfil esta sincronizado com o backend atual."}
                </p>
                <p className={SETTINGS_MUTED_CLASSNAME}>
                  Nome, senha e foto sao tratados no fluxo principal desta tela.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${SETTINGS_GRADIENT_BUTTON_CLASSNAME}`}
                disabled={!canSave}
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className={`${SETTINGS_PANEL_CLASSNAME} p-6`}>
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-[var(--colors-brand-gradient-end)]" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Aparencia</h2>
                </div>
                <p className={SETTINGS_MUTED_CLASSNAME}>
                  Ajuste o tema da interface mantendo o mesmo padrao visual das telas novas.
                </p>
              </div>

              <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex items-center justify-between gap-4 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Modo escuro</p>
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
        </aside>
      </div>
    </div>
  );
}

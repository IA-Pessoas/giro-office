import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Moon, Palette, Settings, Sun, User } from "lucide-react";

import { useMe } from "@shared/hooks";

const SETTINGS_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const SETTINGS_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const SETTINGS_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40";

const SETTINGS_TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";

const SETTINGS_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

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
  const meQuery = useMe();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const htmlTheme = document.documentElement.getAttribute("data-theme");
    setIsDark(htmlTheme === "dark" || document.documentElement.classList.contains("dark"));
  }, []);

  const currentName = meQuery.data?.name ?? "Meu Perfil";
  const currentLogin = meQuery.data?.login ?? "";
  const currentPhotoUrl = meQuery.data?.photo_url ?? null;
  const initials = useMemo(() => getInitials(currentName), [currentName]);

  const handleToggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    setIsDark(nextTheme === "dark");
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
                Estrutura base alinhada ao padrao visual de Administracao.
              </p>
            </div>

            <div className={`${SETTINGS_SUBPANEL_CLASSNAME} flex flex-col gap-4 p-4 sm:flex-row sm:items-center`}>
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                {currentPhotoUrl ? (
                  <img
                    src={currentPhotoUrl}
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
                  O bloco de edicao de perfil entra na proxima etapa.
                </p>
              </div>
            </div>

            <div className={`${SETTINGS_SUBPANEL_CLASSNAME} p-4`}>
              <p className={SETTINGS_TEXT_CLASSNAME}>
                O layout principal ja segue o mesmo shell, tipografia, espacamento e superficies da
                tela de Administracao.
              </p>
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

import { useState, type ComponentType } from "react";
import {
  Bot,
  Boxes,
  FileCheck2,
  KeyRound,
  LayoutDashboard,
  Loader2,
  MonitorCog,
  PackageSearch,
  Phone,
  ShieldAlert,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { cn } from "@shared/ui/newLayout/utils";

import { TiDashboardTab } from "./TiDashboardTab";
import { TiExtensionsTab } from "./TiExtensionsTab";
import { TiInventoryTab } from "./TiInventoryTab";
import { TiPasswordsTab } from "./TiPasswordsTab";
import { TiRequestsTab } from "./TiRequestsTab";
import { TiRobotsTab } from "./TiRobotsTab";
import { TiStockTab } from "./TiStockTab";
import { TiTermsTab } from "./TiTermsTab";
import {
  tiPanelClassName,
  tiWorkspaceContentClassName,
  tiWorkspaceShellClassName,
} from "./tiWorkspaceUi";

type TiTabId =
  | "dashboard"
  | "requests"
  | "inventory"
  | "stock"
  | "terms"
  | "passwords"
  | "extensions"
  | "robots";

type TiTabConfig = {
  id: TiTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  panel: ComponentType;
};

const TI_TABS: TiTabConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Resumo consolidado",
    icon: LayoutDashboard,
    panel: TiDashboardTab,
  },
  {
    id: "requests",
    label: "Chamados",
    description: "Atendimento e mensagens",
    icon: Ticket,
    panel: TiRequestsTab,
  },
  {
    id: "inventory",
    label: "Inventario",
    description: "Ativos e locais",
    icon: Boxes,
    panel: TiInventoryTab,
  },
  {
    id: "stock",
    label: "Estoque",
    description: "Itens, entradas e saidas",
    icon: PackageSearch,
    panel: TiStockTab,
  },
  {
    id: "terms",
    label: "Termos",
    description: "Responsabilidade e assinatura",
    icon: FileCheck2,
    panel: TiTermsTab,
  },
  {
    id: "passwords",
    label: "Senhas",
    description: "Credenciais de TI",
    icon: KeyRound,
    panel: TiPasswordsTab,
  },
  {
    id: "extensions",
    label: "Ramais",
    description: "Telefones internos",
    icon: Phone,
    panel: TiExtensionsTab,
  },
  {
    id: "robots",
    label: "Robos",
    description: "Automacoes e execucoes",
    icon: Bot,
    panel: TiRobotsTab,
  },
];

function TiAccessDenied() {
  return (
    <section className={cn(tiPanelClassName, "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100")}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm dark:bg-slate-950 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Acesso negado ao modulo de Tecnologia</h2>
          <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
            Seu perfil atual nao possui permissao de visualizacao para esta area.
          </p>
        </div>
      </div>
    </section>
  );
}

function TiLoadingState() {
  return (
    <section className={cn(tiPanelClassName, "flex items-center gap-3 text-slate-600 dark:text-slate-300")}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm font-medium">Carregando modulo de Tecnologia...</span>
    </section>
  );
}

export function TiPage() {
  const { access, isLoading: isModuleAccessLoading } = useModuleAccess("ti");
  const [activeTab, setActiveTab] = useState<TiTabId>("dashboard");

  const activeTabConfig = TI_TABS.find((tab) => tab.id === activeTab) ?? TI_TABS[0];
  const ActivePanel = activeTabConfig.panel;

  return (
    <main className={tiWorkspaceShellClassName}>
      <div className={tiWorkspaceContentClassName}>
        <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-950/20">
              <MonitorCog className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Modulo TI
              </p>
              <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Tecnologia</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Atendimento, ativos, estoque, acessos, ramais, termos e automacoes em um unico
                espaco de trabalho.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
            {access.canEdit ? "Edicao liberada" : "Somente leitura"}
          </div>
        </header>

        {isModuleAccessLoading ? <TiLoadingState /> : null}
        {!isModuleAccessLoading && !access.canView ? <TiAccessDenied /> : null}

        {!isModuleAccessLoading && access.canView ? (
          <>
            <nav
              className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4 xl:grid-cols-8"
              aria-label="Abas de Tecnologia"
            >
              {TI_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "flex min-h-[72px] min-w-0 flex-col items-start justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                      isActive
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/70",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="mt-2 w-full truncate font-semibold">{tab.label}</span>
                    <span
                      className={cn(
                        "mt-1 w-full truncate text-xs",
                        isActive ? "text-indigo-600/80 dark:text-indigo-200/70" : "text-slate-400",
                      )}
                    >
                      {tab.description}
                    </span>
                  </button>
                );
              })}
            </nav>

            <ActivePanel />
          </>
        ) : null}
      </div>
    </main>
  );
}

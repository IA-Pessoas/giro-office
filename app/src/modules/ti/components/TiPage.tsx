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

import { useNewTiRequestAlerts } from "../hooks";
import { TiDashboardTab } from "./TiDashboardTab";
import { TiExtensionsTab } from "./TiExtensionsTab";
import { TiInventoryTab } from "./TiInventoryTab";
import { TiPasswordsTab } from "./TiPasswordsTab";
import { TiRequestsTab } from "./TiRequestsTab";
import { TiRobotsTab } from "./TiRobotsTab";
import { TiStockTab } from "./TiStockTab";
import { TiTermsTab } from "./TiTermsTab";
import { tiPanelClassName, tiThinScrollbarClassName, tiWorkspaceShellClassName } from "./tiWorkspaceUi";

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
  icon: LucideIcon;
  panel: ComponentType<{ onOpenRequests?: () => void }>;
};

const TI_TABS: TiTabConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    panel: TiDashboardTab,
  },
  {
    id: "requests",
    label: "Chamados",
    icon: Ticket,
    panel: TiRequestsTab,
  },
  {
    id: "inventory",
    label: "Inventário",
    icon: Boxes,
    panel: TiInventoryTab,
  },
  {
    id: "stock",
    label: "Estoque",
    icon: PackageSearch,
    panel: TiStockTab,
  },
  {
    id: "terms",
    label: "Termos",
    icon: FileCheck2,
    panel: TiTermsTab,
  },
  {
    id: "passwords",
    label: "Senhas",
    icon: KeyRound,
    panel: TiPasswordsTab,
  },
  {
    id: "extensions",
    label: "Ramais",
    icon: Phone,
    panel: TiExtensionsTab,
  },
  {
    id: "robots",
    label: "Robôs",
    icon: Bot,
    panel: TiRobotsTab,
  },
];

const SELF_SERVICE_TI_TABS: TiTabConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    panel: TiDashboardTab,
  },
  {
    id: "requests",
    label: "Chamados",
    icon: Ticket,
    panel: TiRequestsTab,
  },
  {
    id: "terms",
    label: "Meus termos",
    icon: FileCheck2,
    panel: TiTermsTab,
  },
  {
    id: "extensions",
    label: "Ramais",
    icon: Phone,
    panel: TiExtensionsTab,
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
          <h2 className="text-base font-semibold">Acesso negado ao módulo de Tecnologia</h2>
          <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
            Seu perfil atual não possui permissão de visualização para esta área.
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
      <span className="text-sm font-medium">Carregando módulo de Tecnologia...</span>
    </section>
  );
}

export function TiPage() {
  const { access, isLoading: isModuleAccessLoading } = useModuleAccess("ti");
  const [activeTab, setActiveTab] = useState<TiTabId>("dashboard");

  const canManageTi = access.isAdmin;
  useNewTiRequestAlerts(canManageTi);
  const visibleTabs = canManageTi ? TI_TABS : SELF_SERVICE_TI_TABS;
  const visibleActiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleTabs[0].id;
  const activeTabConfig = visibleTabs.find((tab) => tab.id === visibleActiveTab) ?? visibleTabs[0];
  const ActivePanel = activeTabConfig.panel;

  return (
    <div className={tiWorkspaceShellClassName}>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <MonitorCog className="h-6 w-6 text-white" />
            </div>
            Tecnologia
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Chamados, ativos, estoque, acessos e automações em um único fluxo.
          </p>
        </div>
      </header>

      {isModuleAccessLoading ? <TiLoadingState /> : null}
      {!isModuleAccessLoading && !access.canView ? <TiAccessDenied /> : null}

      {!isModuleAccessLoading && access.canView ? (
        <>
          <nav
            aria-label="Abas de Tecnologia"
            className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={cn("overflow-x-auto px-2 pb-1", tiThinScrollbarClassName)}>
              <div role="tablist" className="flex min-w-max items-center justify-center gap-1 pl-7 md:min-w-full">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = visibleActiveTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`ti-tab-${tab.id}`}
                      aria-selected={isActive}
                      aria-controls={`ti-panel-${tab.id}`}
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2.5 font-medium transition-all lg:px-5",
                        isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800",
                      )}
                      onClick={() => setActiveTab(tab.id)}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div
            role="tabpanel"
            id={`ti-panel-${visibleActiveTab}`}
            aria-labelledby={`ti-tab-${visibleActiveTab}`}
          >
            <ActivePanel onOpenRequests={() => setActiveTab("requests")} />
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import {
  Landmark,
  Percent,
  Receipt,
  Search,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

import type { FiscalTabId } from "../types";
import { FiscalPlaceholderSection } from "./FiscalPlaceholderSection";

const fiscalTabs: Array<{
  description: string;
  icon: LucideIcon;
  id: FiscalTabId;
  label: string;
  panelTitle: string;
}> = [
  {
    id: "search",
    label: "Busca Fiscal",
    icon: Search,
    panelTitle: "Busca fiscal por NCM",
    description:
      "A busca agregada vai reunir NCM, ICMS e IPI em um fluxo único, com ativação controlada pela aba.",
  },
  {
    id: "ncm",
    label: "NCM",
    icon: ScrollText,
    panelTitle: "Cadastro e consulta de NCM",
    description:
      "Esta área vai concentrar listagem, detalhe e formulário de NCM usando o contrato novo do fiscal-service.",
  },
  {
    id: "icms",
    label: "ICMS",
    icon: Landmark,
    panelTitle: "Cadastro e consulta de ICMS",
    description:
      "A aba de ICMS já está preparada para receber filtros, tabela e edição apoiados pelo novo módulo.",
  },
  {
    id: "ipi",
    label: "IPI",
    icon: Percent,
    panelTitle: "Cadastro e consulta de IPI",
    description:
      "O espaço de IPI fica isolado desde agora para crescer com queries habilitadas somente quando a aba estiver ativa.",
  },
];

export function FiscalShell() {
  const [activeTab, setActiveTab] = useState<FiscalTabId>("search");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] px-6 py-8 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] dark:shadow-[0_28px_70px_-40px_rgba(2,6,23,0.92)] sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_48%),radial-gradient(circle_at_top_left,rgba(15,23,42,0.06),transparent_35%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.2),transparent_45%),radial-gradient(circle_at_top_left,rgba(15,23,42,0.12),transparent_35%)]"
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,rgba(37,99,235,0.96),rgba(30,64,175,0.96))] text-white shadow-[0_20px_35px_-20px_rgba(37,99,235,0.75)]">
                <Receipt className="h-6 w-6" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Módulo fiscal
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                  Fiscal
                </h1>
              </div>
            </div>

            <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400 sm:text-base">
              Consulta e cadastro de NCM, ICMS e IPI
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
            Estrutura inicial do novo módulo, sem dependência ativa do mock legado.
          </div>
        </div>
      </header>

      <div className="rounded-[28px] border border-slate-200/80 bg-white p-2 shadow-[0_18px_48px_-30px_rgba(15,23,42,0.22)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_20px_55px_-36px_rgba(2,6,23,0.9)]">
        <nav aria-label="Abas do módulo fiscal" className="overflow-x-auto">
          <div role="tablist" className="flex min-w-max items-center gap-2">
            {fiscalTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  id={`fiscal-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`fiscal-panel-${tab.id}`}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.85)] dark:bg-blue-900/40 dark:text-blue-100 dark:shadow-[0_16px_30px_-18px_rgba(30,64,175,0.55)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }`}
                  tabIndex={isActive ? 0 : -1}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-3 shadow-[0_26px_60px_-40px_rgba(15,23,42,0.32)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(15,23,42,0.96))] dark:shadow-[0_30px_65px_-42px_rgba(2,6,23,0.94)] sm:p-4">
        <FiscalActiveTabPanel activeTab={activeTab} />
      </div>
    </div>
  );
}

function FiscalActiveTabPanel({ activeTab }: { activeTab: FiscalTabId }) {
  if (activeTab === "search") {
    return <FiscalSearchTab />;
  }

  if (activeTab === "ncm") {
    return <FiscalNcmTab />;
  }

  if (activeTab === "icms") {
    return <FiscalIcmsTab />;
  }

  return <FiscalIpiTab />;
}

function FiscalSearchTab() {
  const tab = fiscalTabs.find((item) => item.id === "search");

  return (
    <div role="tabpanel" id="fiscal-panel-search" aria-labelledby="fiscal-tab-search">
      <FiscalPlaceholderSection
        title={tab?.panelTitle ?? "Busca Fiscal"}
        description={tab?.description ?? ""}
        icon={tab?.icon ?? Search}
      />
    </div>
  );
}

function FiscalNcmTab() {
  const tab = fiscalTabs.find((item) => item.id === "ncm");

  return (
    <div role="tabpanel" id="fiscal-panel-ncm" aria-labelledby="fiscal-tab-ncm">
      <FiscalPlaceholderSection
        title={tab?.panelTitle ?? "NCM"}
        description={tab?.description ?? ""}
        icon={tab?.icon ?? ScrollText}
      />
    </div>
  );
}

function FiscalIcmsTab() {
  const tab = fiscalTabs.find((item) => item.id === "icms");

  return (
    <div role="tabpanel" id="fiscal-panel-icms" aria-labelledby="fiscal-tab-icms">
      <FiscalPlaceholderSection
        title={tab?.panelTitle ?? "ICMS"}
        description={tab?.description ?? ""}
        icon={tab?.icon ?? Landmark}
      />
    </div>
  );
}

function FiscalIpiTab() {
  const tab = fiscalTabs.find((item) => item.id === "ipi");

  return (
    <div role="tabpanel" id="fiscal-panel-ipi" aria-labelledby="fiscal-tab-ipi">
      <FiscalPlaceholderSection
        title={tab?.panelTitle ?? "IPI"}
        description={tab?.description ?? ""}
        icon={tab?.icon ?? Percent}
      />
    </div>
  );
}

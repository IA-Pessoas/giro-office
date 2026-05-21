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
import { FiscalSearchSection } from "./FiscalSearchSection";

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
      <div>
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            Fiscal
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Consulta e cadastro de NCM, ICMS e IPI
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas do módulo fiscal" className="overflow-x-auto">
          <div role="tablist" className="flex min-w-max items-center gap-1">
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
                  className={`inline-flex shrink-0 items-center rounded-lg px-5 py-2.5 font-medium transition-all ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                  tabIndex={isActive ? 0 : -1}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
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
  return (
    <div role="tabpanel" id="fiscal-panel-search" aria-labelledby="fiscal-tab-search">
      <FiscalSearchSection />
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

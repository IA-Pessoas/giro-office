import { useState } from "react";
import {
  Banknote,
  FileSearch,
  FileStack,
  FileCheck2,
  CalendarRange,
  ClipboardList,
  Percent,
  Landmark,
  Receipt,
  Search,
  ScrollText,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";

import type { FiscalTabId } from "../types";
import { FiscalAnticipationsSection } from "./FiscalAnticipationsSection";
import { FiscalConferencesSection } from "./FiscalConferencesSection";
import { FiscalAnnualControlsSection } from "./FiscalAnnualControlsSection";
import { FiscalControlsSection } from "./FiscalControlsSection";
import { FiscalIcmsSection } from "./FiscalIcmsSection";
import { FiscalInvoicePdfSection } from "./FiscalInvoicePdfSection";
import { FiscalIpiSection } from "./FiscalIpiSection";
import { FiscalMalhasSection } from "./FiscalMalhasSection";
import { FiscalIpiSpreadsheetSection } from "./FiscalIpiSpreadsheetSection";
import { FiscalNcmSection } from "./FiscalNcmSection";
import { FiscalRatesSection } from "./FiscalRatesSection";
import { FiscalRevenuesSection } from "./FiscalRevenuesSection";
import { FiscalSimplesBatchSection } from "./FiscalSimplesBatchSection";
import { FiscalSearchSection } from "./FiscalSearchSection";
import { FiscalWholesaleSection } from "./FiscalWholesaleSection";
import { FiscalSefazXmlSection } from "./FiscalSefazXmlSection";
import { FiscalSpedXmlSection } from "./FiscalSpedXmlSection";
import { FiscalXmlSelectionSection } from "./FiscalXmlSelectionSection";
import { FiscalXmlTaxesSection } from "./FiscalXmlTaxesSection";

const fiscalTabs: Array<{
  icon: LucideIcon;
  id: FiscalTabId;
  label: string;
}> = [
  {
    id: "search",
    label: "Busca Fiscal",
    icon: Search,
  },
  {
    id: "controls",
    label: "Controle mensal",
    icon: ClipboardList,
  },
  {
    id: "annual",
    label: "Controle anual",
    icon: CalendarRange,
  },
  {
    id: "ncm",
    label: "NCM",
    icon: ScrollText,
  },
  {
    id: "icms",
    label: "ICMS",
    icon: Landmark,
  },
  {
    id: "ipi",
    label: "IPI",
    icon: Percent,
  },
  {
    id: "rates",
    label: "Alíquotas ISS/ICMS",
    icon: Percent,
  },
  {
    id: "revenues",
    label: "Simples Nacional",
    icon: Banknote,
  },
  {
    id: "malhas",
    label: "Malhas",
    icon: FileSearch,
  },
  {
    id: "anticipations",
    label: "Antecipações",
    icon: FileStack,
  },
  {
    id: "wholesale",
    label: "Atacadista",
    icon: Warehouse,
  },
  {
    id: "conferences",
    label: "Conferências",
    icon: FileCheck2,
  },
];

export function FiscalShell() {
  const [activeTab, setActiveTab] = useState<FiscalTabId>("search");
  const { access: fiscalAccess } = useModuleAccess("fiscal");

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
            Consulta e cadastro de NCM, ICMS, IPI, alíquotas, receitas e malhas por empresa, e conferência de arquivos
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas do módulo fiscal" className="overflow-x-auto u-scrollbar-system">
          <div role="tablist" className="flex min-w-max items-center justify-center gap-1">
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
        <FiscalActiveTabPanel
          activeTab={activeTab}
          canEdit={fiscalAccess.canEdit}
          canDelete={fiscalAccess.isAdmin}
        />
      </div>
    </div>
  );
}

function FiscalActiveTabPanel({
  activeTab,
  canEdit,
  canDelete,
}: {
  activeTab: FiscalTabId;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (activeTab === "search") {
    return <FiscalSearchTab />;
  }

  if (activeTab === "controls") {
    return <div role="tabpanel" id="fiscal-panel-controls" aria-labelledby="fiscal-tab-controls"><FiscalControlsSection canEdit={canEdit} canAuthorize={canDelete} /></div>;
  }

  if (activeTab === "annual") {
    return <div role="tabpanel" id="fiscal-panel-annual" aria-labelledby="fiscal-tab-annual"><FiscalAnnualControlsSection canEdit={canEdit} /></div>;
  }

  if (activeTab === "ncm") {
    return <FiscalNcmTab canEdit={canEdit} canDelete={canDelete} />;
  }

  if (activeTab === "icms") {
    return <FiscalIcmsTab canEdit={canEdit} canDelete={canDelete} />;
  }

  if (activeTab === "rates") {
    return <div role="tabpanel" id="fiscal-panel-rates" aria-labelledby="fiscal-tab-rates"><FiscalRatesSection canEdit={canEdit} /></div>;
  }

  if (activeTab === "revenues") {
    return <div role="tabpanel" id="fiscal-panel-revenues" aria-labelledby="fiscal-tab-revenues">{canEdit ? <FiscalSimplesBatchSection /> : null}<FiscalRevenuesSection canEdit={canEdit} /></div>;
  }

  if (activeTab === "wholesale") {
    return <div role="tabpanel" id="fiscal-panel-wholesale" aria-labelledby="fiscal-tab-wholesale"><FiscalWholesaleSection canEdit={canEdit} /></div>;
  }

  if (activeTab === "malhas") {
    return <div role="tabpanel" id="fiscal-panel-malhas" aria-labelledby="fiscal-tab-malhas"><FiscalMalhasSection canEdit={canEdit} canTransfer={canDelete} /></div>;
  }

  if (activeTab === "anticipations") {
    return <div role="tabpanel" id="fiscal-panel-anticipations" aria-labelledby="fiscal-tab-anticipations"><FiscalAnticipationsSection canEdit={canEdit} canAuthorize={canDelete} /></div>;
  }

  if (activeTab === "conferences") {
    return <div role="tabpanel" id="fiscal-panel-conferences" aria-labelledby="fiscal-tab-conferences"><div className="space-y-8"><FiscalConferencesSection canEdit={canEdit} /><FiscalIpiSpreadsheetSection canEdit={canEdit} /><FiscalSefazXmlSection canEdit={canEdit} /><FiscalSpedXmlSection canEdit={canEdit} /><FiscalXmlSelectionSection canEdit={canEdit} /><FiscalXmlTaxesSection canEdit={canEdit} /><FiscalInvoicePdfSection canEdit={canEdit} /></div></div>;
  }

  return <FiscalIpiTab canEdit={canEdit} canDelete={canDelete} />;
}

function FiscalSearchTab() {
  return (
    <div role="tabpanel" id="fiscal-panel-search" aria-labelledby="fiscal-tab-search">
      <FiscalSearchSection />
    </div>
  );
}

function FiscalNcmTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  return (
    <div role="tabpanel" id="fiscal-panel-ncm" aria-labelledby="fiscal-tab-ncm">
      <FiscalNcmSection canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

function FiscalIcmsTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  return (
    <div role="tabpanel" id="fiscal-panel-icms" aria-labelledby="fiscal-tab-icms">
      <FiscalIcmsSection canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

function FiscalIpiTab({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  return (
    <div role="tabpanel" id="fiscal-panel-ipi" aria-labelledby="fiscal-tab-ipi">
      <FiscalIpiSection canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

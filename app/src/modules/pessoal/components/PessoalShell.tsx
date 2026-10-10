import { useState } from "react";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  KeyRound,
  Landmark,
  ListChecks,
  UserRoundCog,
  WalletCards,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { DepartmentAgendaSection } from "@modules/contabil";

import { PESSOAL_TABS } from "../services/pessoalService.contract";
import type { PessoalClientOption, PessoalTabId } from "../types";
import { PessoalClientSelector } from "./PessoalClientSelector";
import { PessoalGroupsSection } from "./PessoalGroupsSection";
import { PessoalGroupAssignmentSection } from "./PessoalGroupAssignmentSection";
import { PessoalObligationsSection } from "./PessoalObligationsSection";
import { PessoalOverviewSection } from "./PessoalOverviewSection";
import { PessoalPayrollSection } from "./PessoalPayrollSection";
import { PessoalPasswordsSection } from "./PessoalPasswordsSection";
import { PessoalTrackingSection } from "./PessoalTrackingSection";
import { PessoalUnionsSection } from "./PessoalUnionsSection";

const tabIcons = {
  overview: BarChart3,
  groups: Boxes,
  groupAssignments: ListChecks,
  unions: Landmark,
  payroll: WalletCards,
  obligations: CheckSquare,
  tracking: ClipboardList,
  passwords: KeyRound,
  agenda: CalendarDays,
} satisfies Record<PessoalTabId, typeof BarChart3>;

export function PessoalShell() {
  const { access, isLoading } = useModuleAccess("pessoal");
  const [activeTab, setActiveTab] = useState<PessoalTabId>("overview");
  const [selectedClient, setSelectedClient] = useState<PessoalClientOption | null>(null);
  const selectedClientId = selectedClient?.id ?? "";

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6 text-sm text-slate-500">
        Carregando acesso...
      </div>
    );
  }

  if (!access.canView) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          Acesso negado ao módulo de Departamento Pessoal.
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
              <UserRoundCog className="h-6 w-6 text-white" />
            </span>
            Departamento Pessoal
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Gestão de folha, obrigações, sindicatos e acessos.
          </p>
        </div>
        <PessoalClientSelector
          selectedClient={selectedClient}
          onSelectClient={setSelectedClient}
        />
      </header>

      <nav className="overflow-x-auto u-scrollbar-system rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        <div role="tablist" className="flex min-w-max items-center justify-center gap-1 sm:min-w-full">
          {PESSOAL_TABS.map((tab) => {
            const Icon = tabIcons[tab.id];
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-w-fit flex-1 shrink-0 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {activeTab === "overview" ? (
        <PessoalOverviewSection onSelectTab={setActiveTab} />
      ) : activeTab === "groups" ? (
        <PessoalGroupsSection canEdit={access.canEdit} />
      ) : activeTab === "groupAssignments" ? (
        <PessoalGroupAssignmentSection canEdit={access.canEdit} />
      ) : activeTab === "unions" ? (
        <PessoalUnionsSection canEdit={access.canEdit} />
      ) : activeTab === "payroll" ? (
        <PessoalPayrollSection
          selectedClientId={selectedClientId}
          selectedClient={selectedClient}
          canEdit={access.canEdit}
        />
      ) : activeTab === "obligations" ? (
        <PessoalObligationsSection selectedClientId={selectedClientId} canEdit={access.canEdit} />
      ) : activeTab === "tracking" ? (
        <PessoalTrackingSection
          selectedClientId={selectedClientId}
          selectedClient={selectedClient}
          canEdit={access.canEdit}
        />
      ) : activeTab === "passwords" ? (
        <PessoalPasswordsSection
          key={selectedClientId}
          selectedClientId={selectedClientId}
          canEdit={access.canEdit}
        />
      ) : activeTab === "agenda" ? (
        // Recorte do departamento na agenda compartilhada; o Pessoal não tem agenda própria.
        <DepartmentAgendaSection module="pessoal" canEdit={access.canEdit} allowMine />
      ) : null}
    </div>
  );
}

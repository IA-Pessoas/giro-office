import { useState } from "react";
import {
  BarChart3,
  CheckSquare,
  ClipboardList,
  KeyRound,
  Landmark,
  UserRoundCog,
  WalletCards,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { useClients } from "@modules/clients";

import { PESSOAL_TABS } from "../services/pessoalService.contract";
import type { PessoalTabId } from "../types";
import { PessoalClientSelector } from "./PessoalClientSelector";
import { PessoalOverviewSection } from "./PessoalOverviewSection";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";
import { PessoalUnionsSection } from "./PessoalUnionsSection";

const tabIcons = {
  overview: BarChart3,
  unions: Landmark,
  payroll: WalletCards,
  obligations: CheckSquare,
  tracking: ClipboardList,
  passwords: KeyRound,
} satisfies Record<PessoalTabId, typeof BarChart3>;

const clientRequiredTabs = new Set<PessoalTabId>([
  "payroll",
  "obligations",
  "tracking",
  "passwords",
]);

export function PessoalShell() {
  const { access, isLoading } = useModuleAccess("pessoal");
  const clientQuery = useClients({ status: "Ativo", page: 1, limit: 100 });
  const [activeTab, setActiveTab] = useState<PessoalTabId>("overview");
  const [selectedClientId, setSelectedClientId] = useState("");
  const hasClient = selectedClientId.length > 0;
  const activeTabLabel = PESSOAL_TABS.find((tab) => tab.id === activeTab)?.label;
  const clients = (clientQuery.data?.items ?? []).map((client) => ({
    id: client.id,
    name: client.company_name || client.name,
    document: client.cpf_cnpj,
  }));

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
          Acesso negado ao modulo de Departamento Pessoal.
        </section>
      </div>
    );
  }

  const ActiveIcon = tabIcons[activeTab];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md">
              <UserRoundCog className="h-6 w-6 text-white" />
            </span>
            Departamento Pessoal
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Gestao de folha, obrigacoes, sindicatos e acessos.
          </p>
        </div>
        <PessoalClientSelector
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
          isLoading={clientQuery.isLoading}
          isError={clientQuery.isError}
        />
      </header>

      <nav className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
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
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
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
        <PessoalOverviewSection />
      ) : activeTab === "unions" ? (
        <PessoalUnionsSection canEdit={access.canEdit} />
      ) : (
        <PessoalPlaceholderSection
          icon={ActiveIcon}
          title={activeTabLabel || "Departamento Pessoal"}
          description="Esta area sera entregue em uma branch funcional propria."
          requiresClient={clientRequiredTabs.has(activeTab)}
          hasClient={hasClient}
        />
      )}
    </div>
  );
}

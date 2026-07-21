import { useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  ClipboardList,
  Loader2,
  WalletCards,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { clientService, type Client } from "@modules/clients";

import { useParcelamentoInstallments, useParcelamentoPanoramas } from "../hooks";
import { PARCELAMENTO_TABS } from "../services";
import type {
  ParcelamentoClientOption,
  ParcelamentoListFilters,
  ParcelamentoTabId,
} from "../types";
import { ParcelamentoClientSelector } from "./ParcelamentoClientSelector";
import { ParcelamentoCompetenciesSection } from "./ParcelamentoCompetenciesSection";
import { ParcelamentoDashboard } from "./ParcelamentoDashboard";
import { ParcelamentoInstallmentsSection } from "./ParcelamentoInstallmentsSection";
import { ParcelamentoPanoramasSection } from "./ParcelamentoPanoramasSection";
import { ParcelamentoStateBox } from "./ParcelamentoStateBox";

const tabIcons = {
  dashboard: BarChart3,
  installments: BadgeDollarSign,
  competencies: ClipboardList,
  panoramas: WalletCards,
} satisfies Record<ParcelamentoTabId, typeof BarChart3>;

function toParcelamentoClientOption(client: Client): ParcelamentoClientOption {
  return {
    id: client.id,
    name: client.company_name || client.name,
    document: client.cpf_cnpj,
  };
}

export function ParcelamentoShell() {
  const { access, isLoading } = useModuleAccess("parcelamento");
  const [activeTab, setActiveTab] = useState<ParcelamentoTabId>("dashboard");
  const [selectedClient, setSelectedClient] = useState<ParcelamentoClientOption | null>(null);
  const filters = useMemo<ParcelamentoListFilters>(
    () => ({
      client_id: selectedClient?.id,
      page: 1,
      page_size: 50,
    }),
    [selectedClient?.id],
  );
  const installmentsQuery = useParcelamentoInstallments(filters, { enabled: access.canView });
  const panoramasQuery = useParcelamentoPanoramas(filters, { enabled: access.canView });

  function selectClientById(clientId: string) {
    if (selectedClient?.id === clientId) {
      return;
    }

    setSelectedClient({ id: clientId, name: "Cliente do parcelamento" });

    void clientService
      .getById(clientId)
      .then((client) => {
        if (!client) {
          return;
        }

        const nextClient = toParcelamentoClientOption(client);

        setSelectedClient((currentClient) =>
          currentClient?.id === clientId ? nextClient : currentClient,
        );
      })
      .catch(() => undefined);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <ParcelamentoStateBox
          icon={Loader2}
          title="Carregando acesso"
          description="Validando permissões do módulo."
        />
      </div>
    );
  }

  if (!access.canView) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <ParcelamentoStateBox
          icon={AlertCircle}
          title="Acesso negado"
          description="Seu usuário não possui visualização para o módulo de Parcelamento."
          tone="warning"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-md">
              <BadgeDollarSign className="h-6 w-6 text-white" />
            </span>
            Parcelamento
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Acompanhamento de parcelamentos, competências e panoramas mensais.
          </p>
        </div>
        <ParcelamentoClientSelector
          selectedClient={selectedClient}
          onSelectClient={setSelectedClient}
        />
      </header>

      <nav className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        <div role="tablist" className="flex min-w-max items-center justify-center gap-1 sm:min-w-full">
          {PARCELAMENTO_TABS.map((tab) => {
            const Icon = tabIcons[tab.id];
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-w-fit flex-1 shrink-0 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
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

      {activeTab === "dashboard" ? (
        <ParcelamentoDashboard
          installmentsPage={installmentsQuery.data}
          panoramasPage={panoramasQuery.data}
          isLoading={installmentsQuery.isLoading || panoramasQuery.isLoading}
          isError={installmentsQuery.isError || panoramasQuery.isError}
          onSelectTab={setActiveTab}
        />
      ) : activeTab === "installments" ? (
        <ParcelamentoInstallmentsSection
          selectedClient={selectedClient}
          canEdit={access.canEdit}
          filters={filters}
          onSelectClientId={selectClientById}
        />
      ) : activeTab === "competencies" ? (
        <ParcelamentoCompetenciesSection
          selectedClient={selectedClient}
          canEdit={access.canEdit}
          onSelectClientId={selectClientById}
        />
      ) : (
        <ParcelamentoPanoramasSection
          selectedClient={selectedClient}
          canEdit={access.canEdit}
        />
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  ClipboardList,
  FileText,
  Loader2,
  WalletCards,
} from "lucide-react";

import { useModuleAccess } from "@modules/auth";

import { useParcelamentoInstallments, useParcelamentoPanoramas } from "../hooks";
import { PARCELAMENTO_TABS } from "../services";
import type {
  ParcelamentoClientOption,
  ParcelamentoListFilters,
  ParcelamentoListPage,
  ParcelamentoPanorama,
  ParcelamentoTabId,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import { ParcelamentoClientSelector } from "./ParcelamentoClientSelector";
import { ParcelamentoCompetenciesSection } from "./ParcelamentoCompetenciesSection";
import { ParcelamentoDashboard } from "./ParcelamentoDashboard";
import { ParcelamentoInstallmentsSection } from "./ParcelamentoInstallmentsSection";
import { ParcelamentoStateBox } from "./ParcelamentoStateBox";

const tabIcons = {
  dashboard: BarChart3,
  installments: BadgeDollarSign,
  competencies: ClipboardList,
  panoramas: WalletCards,
} satisfies Record<ParcelamentoTabId, typeof BarChart3>;

const PANORAMA_CHECK_FIELDS = [
  "cnd_municipal",
  "cnd_state",
  "cnd_federal",
  "cnd_fgts",
  "cnd_labor",
  "protests",
  "state_tax_situation",
  "federal_tax_situation",
] as const satisfies readonly (keyof ParcelamentoPanorama)[];

interface ParcelamentoReadPanelProps<T> {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  data?: ParcelamentoListPage<T>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  renderItem: (item: T) => JSX.Element;
}

function ParcelamentoReadPanel<T,>({
  title,
  emptyTitle,
  emptyDescription,
  data,
  isLoading,
  isError,
  error,
  renderItem,
}: ParcelamentoReadPanelProps<T>) {
  if (isLoading) {
    return (
      <ParcelamentoStateBox
        icon={Loader2}
        title="Carregando dados"
        description="Buscando informações reais do módulo."
      />
    );
  }

  if (isError) {
    return (
      <ParcelamentoStateBox
        icon={AlertCircle}
        title="Não foi possível carregar"
        description={getParcelamentoErrorMessage(error, "Tente novamente em alguns instantes.")}
        tone="error"
      />
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <ParcelamentoStateBox
        icon={FileText}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {data?.total ?? items.length} registros encontrados.
          </p>
        </div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Página {data?.page ?? 1}
        </p>
      </div>

      <div className="mt-4 grid gap-3">{items.map(renderItem)}</div>
    </section>
  );
}

function renderPanorama(item: ParcelamentoPanorama) {
  const completedCount = PANORAMA_CHECK_FIELDS.filter((field) => item[field]).length;

  return (
    <article
      key={item.id}
      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Competência {item.competence}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Cliente {item.client_id}
          </p>
        </div>
        <span className="w-fit rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {completedCount}/{PANORAMA_CHECK_FIELDS.length} itens
        </span>
      </div>
    </article>
  );
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
        />
      ) : activeTab === "competencies" ? (
        <ParcelamentoCompetenciesSection
          selectedClient={selectedClient}
          canEdit={access.canEdit}
        />
      ) : (
        <ParcelamentoReadPanel
          title="Panoramas"
          emptyTitle="Nenhum panorama encontrado"
          emptyDescription="A lista será exibida assim que houver dados reais para o filtro atual."
          data={panoramasQuery.data}
          isLoading={panoramasQuery.isLoading}
          isError={panoramasQuery.isError}
          error={panoramasQuery.error}
          renderItem={renderPanorama}
        />
      )}
    </div>
  );
}

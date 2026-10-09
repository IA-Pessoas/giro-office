import { useState, type ReactNode } from "react";
import {
  Calculator,
  CheckSquare,
  FileText,
  ReceiptText,
  UserCog,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { useContabilControlPortfolio } from "../hooks";
import { ContabilControlSection } from "./ContabilControlSection";
import { CONTABIL_SELECT_CLASS } from "./ContabilCompetenceSelect";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilPortfolioSection } from "./ContabilPortfolioSection";
import { ContabilResponsiblePortfolioSection } from "./ContabilResponsiblePortfolioSection";
import { ContabilResponsibleSection } from "./ContabilResponsibleSection";
import { ContabilRelationshipSection } from "./ContabilRelationshipSection";
import { ContabilStateBox } from "./ContabilStateBox";
import { TriageDocumentsSection } from "./TriageDocumentsSection";

type ContabilTabId = "control" | "responsible" | "relationship" | "documents";

interface ContabilShellProps {
  clientId?: string;
  clientName?: string;
  canEdit: boolean;
  defaultTab?: ContabilTabId;
  headerAction?: ReactNode;
}

export function ContabilShell({
  clientId,
  clientName,
  canEdit,
  defaultTab,
  headerAction,
}: ContabilShellProps) {
  const [activeTab, setActiveTab] = useState<ContabilTabId>(defaultTab ?? "control");
  // Sem cliente na rota, Relacionamento e Documentos usam a empresa escolhida aqui.
  const [pickedClientId, setPickedClientId] = useState("");
  const hasClient = Boolean(clientId);
  const contabilTabs: Array<{
    icon: LucideIcon;
    id: ContabilTabId;
    label: string;
  }> = [
    {
      id: "control",
      label: "Controle",
      icon: CheckSquare,
    },
    {
      id: "responsible",
      label: "Responsável",
      icon: UserCog,
    },
    {
      id: "relationship",
      label: "Relacionamento",
      icon: Waypoints,
    },
    { id: "documents", label: "Documentos", icon: FileText },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <ReceiptText className="h-5 w-5 text-white" />
            </div>
            Contábil
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Controle mensal, responsáveis e relacionamento contábil por cliente.
          </p>
        </div>
        {headerAction}
      </header>

      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas do módulo contábil" className="overflow-x-auto u-scrollbar-system">
          <div role="tablist" className="flex min-w-max items-center justify-center gap-1">
            {contabilTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  id={`contabil-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`contabil-panel-${tab.id}`}
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

      {hasClient && clientName ? (
        <div className="px-1 text-sm text-gray-500 dark:text-slate-400">
          <span className="font-medium text-gray-700 dark:text-slate-300">Empresa:</span>{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{clientName}</span>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <ContabilActiveTabPanel
          activeTab={activeTab}
          clientId={clientId}
          clientName={clientName}
          canEdit={canEdit}
          pickedClientId={pickedClientId}
          onPickClient={setPickedClientId}
        />
      </div>
    </div>
  );
}

function ContabilClientSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (clientId: string) => void;
}) {
  const [competence] = useState(getCurrentContabilCompetence);
  const portfolioQuery = useContabilControlPortfolio(competence);
  const companies = [...(portfolioQuery.data?.items ?? [])].sort((left, right) =>
    left.legal_name.localeCompare(right.legal_name, "pt-BR"),
  );

  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-slate-300 sm:flex-row sm:items-center">
      Empresa
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={portfolioQuery.isLoading}
        className={`${CONTABIL_SELECT_CLASS} w-full sm:w-96`}
      >
        <option value="">
          {portfolioQuery.isLoading
            ? "Carregando empresas..."
            : portfolioQuery.isError
              ? "Não foi possível carregar as empresas"
              : "Selecione uma empresa"}
        </option>
        {companies.map((company) => (
          <option key={company.client_id} value={company.client_id}>
            {company.legal_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ContabilActiveTabPanel({
  activeTab,
  clientId,
  clientName,
  canEdit,
  pickedClientId,
  onPickClient,
}: {
  activeTab: ContabilTabId;
  clientId?: string;
  clientName?: string;
  canEdit: boolean;
  pickedClientId: string;
  onPickClient: (clientId: string) => void;
}) {
  if (!clientId) {
    if (activeTab === "control") {
      return (
        <div role="tabpanel" id="contabil-panel-control" aria-labelledby="contabil-tab-control">
          <ContabilPortfolioSection canEdit={canEdit} />
        </div>
      );
    }

    if (activeTab === "responsible") {
      return (
        <div
          role="tabpanel"
          id="contabil-panel-responsible"
          aria-labelledby="contabil-tab-responsible"
        >
          <ContabilResponsiblePortfolioSection canEdit={canEdit} />
        </div>
      );
    }

    return (
      <div
        role="tabpanel"
        id={`contabil-panel-${activeTab}`}
        aria-labelledby={`contabil-tab-${activeTab}`}
      >
        <div className="space-y-4">
          <ContabilClientSelect value={pickedClientId} onChange={onPickClient} />
          {pickedClientId ? (
            activeTab === "documents" ? (
              <TriageDocumentsSection clientId={pickedClientId} canEdit={canEdit} canEditClosing={canEdit} />
            ) : (
              <ContabilRelationshipSection clientId={pickedClientId} canEdit={canEdit} />
            )
          ) : (
            <ContabilStateBox icon={Calculator} title="Selecione uma empresa para começar">
              Escolha a empresa acima para abrir o {activeTab === "documents" ? "controle de documentos" : "relacionamento contábil"}.
            </ContabilStateBox>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === "control") {
    return (
      <div role="tabpanel" id="contabil-panel-control" aria-labelledby="contabil-tab-control">
        <ContabilControlSection clientId={clientId} clientName={clientName} canEdit={canEdit} />
      </div>
    );
  }

  if (activeTab === "responsible") {
    return (
      <div
        role="tabpanel"
        id="contabil-panel-responsible"
        aria-labelledby="contabil-tab-responsible"
      >
        <ContabilResponsibleSection clientId={clientId} canEdit={canEdit} />
      </div>
    );
  }

  if (activeTab === "documents") {
    return <div role="tabpanel" id="contabil-panel-documents" aria-labelledby="contabil-tab-documents"><TriageDocumentsSection clientId={clientId} canEdit={canEdit} canEditClosing={canEdit} /></div>;
  }

  return (
    <div
      role="tabpanel"
      id="contabil-panel-relationship"
      aria-labelledby="contabil-tab-relationship"
    >
      <ContabilRelationshipSection clientId={clientId} canEdit={canEdit} />
    </div>
  );
}

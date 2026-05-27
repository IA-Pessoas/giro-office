import { useMemo, useState, type ReactNode } from "react";
import {
  Calculator,
  CheckSquare,
  ReceiptText,
  Users,
  UserCog,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { ContabilControlSection } from "./ContabilControlSection";
import { ContabilResponsibleSection } from "./ContabilResponsibleSection";
import { ContabilRelationshipSection } from "./ContabilRelationshipSection";
import { ContabilStateBox } from "./ContabilStateBox";

type ContabilTabId = "client" | "control" | "responsible" | "relationship";

interface ContabilShellProps {
  clientId?: string;
  clientName?: string;
  lockedClient?: boolean;
  canEdit: boolean;
  clientPickerContent?: ReactNode;
  defaultTab?: ContabilTabId;
}

export function ContabilShell({
  clientId,
  clientName,
  lockedClient = false,
  canEdit,
  clientPickerContent,
  defaultTab,
}: ContabilShellProps) {
  const [activeTab, setActiveTab] = useState<ContabilTabId>(
    defaultTab ?? (lockedClient ? "control" : "client"),
  );
  const hasClient = Boolean(clientId);
  const contabilTabs = useMemo<
    Array<{
      icon: LucideIcon;
      id: ContabilTabId;
      label: string;
    }>
  >(
    () =>
      [
        !lockedClient
          ? {
              id: "client" as const,
              label: "Cliente",
              icon: Users,
            }
          : null,
        {
          id: "control" as const,
          label: "Controle",
          icon: CheckSquare,
        },
        {
          id: "responsible" as const,
          label: "Responsável",
          icon: UserCog,
        },
        {
          id: "relationship" as const,
          label: "Relacionamento",
          icon: Waypoints,
        },
      ].filter((tab): tab is NonNullable<typeof tab> => Boolean(tab)),
    [lockedClient],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
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

      <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas do módulo contábil" className="overflow-x-auto">
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
          canEdit={canEdit}
          clientPickerContent={clientPickerContent}
        />
      </div>
    </div>
  );
}

function ContabilActiveTabPanel({
  activeTab,
  clientId,
  canEdit,
  clientPickerContent,
}: {
  activeTab: ContabilTabId;
  clientId?: string;
  canEdit: boolean;
  clientPickerContent?: ReactNode;
}) {
  if (activeTab === "client") {
    return (
      <div role="tabpanel" id="contabil-panel-client" aria-labelledby="contabil-tab-client">
        {clientPickerContent ?? (
          <ContabilStateBox icon={Users} title="Seleção de cliente indisponível">
            Não há um seletor de cliente configurado para esta visualização.
          </ContabilStateBox>
        )}
      </div>
    );
  }

  if (!clientId) {
    return (
      <div
        role="tabpanel"
        id={`contabil-panel-${activeTab}`}
        aria-labelledby={`contabil-tab-${activeTab}`}
      >
        <ContabilStateBox icon={Calculator} title="Selecione um cliente para começar">
          Escolha um cliente na aba Cliente para abrir o controle mensal e os cadastros contábeis deste fluxo.
        </ContabilStateBox>
      </div>
    );
  }

  if (activeTab === "control") {
    return (
      <div role="tabpanel" id="contabil-panel-control" aria-labelledby="contabil-tab-control">
        <ContabilControlSection clientId={clientId} canEdit={canEdit} />
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

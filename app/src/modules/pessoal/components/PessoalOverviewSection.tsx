import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CheckSquare,
  ClipboardList,
  Landmark,
  WalletCards,
} from "lucide-react";

import { usePessoalOverview } from "../hooks/usePessoalOverview";
import type { PessoalTabId } from "../types";

type OverviewCard = {
  label: string;
  value?: string;
  description: string;
  details: string[];
  icon: LucideIcon;
  tabId: PessoalTabId;
};

interface PessoalOverviewSectionProps {
  onSelectTab: (tabId: PessoalTabId) => void;
}

/** "2026-09" -> "09/2026". */
function formatCompetence(competence: string | undefined): string {
  const [year, month] = competence?.split("-") ?? [];
  return year && month ? `${month}/${year}` : "Competência";
}

function formatCount(value: number, isLoading: boolean) {
  return isLoading ? "..." : String(value);
}

export function PessoalOverviewSection({ onSelectTab }: PessoalOverviewSectionProps) {
  const overviewQuery = usePessoalOverview();
  const summary = overviewQuery.data;
  const isOverviewLoading = overviewQuery.isLoading;
  const unions = summary?.unions;
  const ldd = summary?.ldd;
  const featureCards: OverviewCard[] = [
    {
      label: "Sindicatos",
      value: formatCount(unions?.total ?? 0, isOverviewLoading),
      description: "Folha e data-base.",
      details: [
        `${formatCount(unions?.withBaseDate ?? 0, isOverviewLoading)} com base`,
        `${formatCount(unions?.withoutBaseDate ?? 0, isOverviewLoading)} sem base`,
        `${formatCount(unions?.withCnpj ?? 0, isOverviewLoading)} CNPJs`,
      ],
      icon: Landmark,
      tabId: "unions",
    },
    {
      label: "Acompanhamentos",
      value: formatCount(ldd?.total ?? 0, isOverviewLoading),
      description: "LDD do departamento.",
      details: [
        `${formatCount(ldd?.open ?? 0, isOverviewLoading)} abertos`,
        `${formatCount(ldd?.overdue ?? 0, isOverviewLoading)} vencidos`,
        `${formatCount(ldd?.paid ?? 0, isOverviewLoading)} pagos`,
      ],
      icon: ClipboardList,
      tabId: "tracking",
    },
    {
      label: "Folha",
      value: formatCount(summary?.payroll?.total ?? 0, isOverviewLoading),
      description: "Clientes com folha configurada.",
      details: ["Cadastro", "Parâmetros"],
      icon: WalletCards,
      tabId: "payroll",
    },
    {
      label: "Obrigações",
      value: formatCount(summary?.obligations?.total ?? 0, isOverviewLoading),
      description: "Conferências da competência atual.",
      details: [formatCompetence(summary?.obligations?.competence), "Checklist"],
      icon: CheckSquare,
      tabId: "obligations",
    },
  ];
  const hasError = overviewQuery.isError;

  function renderCard(card: OverviewCard) {
    const Icon = card.icon;

    return (
      <button
        key={card.label}
        type="button"
        onClick={() => onSelectTab(card.tabId)}
        className="rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-white">
              {card.label}
            </p>
            {card.value ? (
              <p className="mt-1.5 text-2xl font-bold leading-none text-gray-900 dark:text-white">
                {card.value}
              </p>
            ) : null}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
          {card.description}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.details.map((detail) => (
            <span
              key={detail}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            >
              {detail}
            </span>
          ))}
        </div>
      </button>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resumo operacional</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Folha, obrigações, sindicatos e acompanhamentos do Departamento Pessoal.
          </p>
        </div>
        {hasError ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Não foi possível carregar todos os indicadores agora.
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {featureCards.map(renderCard)}
      </div>
    </section>
  );
}

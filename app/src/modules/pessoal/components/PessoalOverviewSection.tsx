import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CheckSquare,
  ClipboardList,
  Landmark,
  UserRoundCog,
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
      description: "Por cliente.",
      details: ["Cadastro", "Parâmetros"],
      icon: WalletCards,
      tabId: "payroll",
    },
    {
      label: "Obrigações",
      description: "Conferência mensal.",
      details: ["Competência", "Checklist"],
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
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="relative min-h-[260px] overflow-hidden rounded-xl border border-blue-500/40 bg-gradient-to-br from-blue-700 via-sky-700 to-blue-800 p-5 text-white shadow-lg">
        <div className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
          <UserRoundCog className="h-5 w-5" />
        </div>

        <div className="flex min-h-[210px] max-w-xl flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">
              Resumo operacional
            </p>
            <h2 className="mt-4 max-w-lg text-3xl font-bold leading-tight">
              Departamento Pessoal
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100">
              Rotinas de folha, obrigações, sindicatos, acompanhamentos e acessos no mesmo fluxo.
            </p>
          </div>

          {hasError ? (
            <div className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs text-white">
              <AlertCircle className="h-4 w-4" />
              Não foi possível carregar todos os indicadores agora.
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {featureCards.slice(0, 2).map(renderCard)}
        <div className="grid grid-cols-2 gap-3">
          {featureCards.slice(2).map(renderCard)}
        </div>
      </div>
    </section>
  );
}

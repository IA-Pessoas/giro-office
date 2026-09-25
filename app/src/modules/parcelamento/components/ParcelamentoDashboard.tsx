import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  Clock3,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  ParcelamentoInstallment,
  ParcelamentoListPage,
  ParcelamentoPanorama,
  ParcelamentoTabId,
} from "../types";
import { ParcelamentoStateBox } from "./ParcelamentoStateBox";

interface ParcelamentoDashboardProps {
  installmentsPage?: ParcelamentoListPage<ParcelamentoInstallment>;
  panoramasPage?: ParcelamentoListPage<ParcelamentoPanorama>;
  isLoading: boolean;
  isError: boolean;
  onSelectTab: (tab: ParcelamentoTabId) => void;
}

function formatCount(value: number, isLoading: boolean) {
  return isLoading ? "..." : value.toLocaleString("pt-BR");
}

function DashboardHeroCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-violet-600 p-5 text-white shadow-sm">
      <div className="flex min-h-[180px] items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-base font-semibold uppercase tracking-[0.06em] text-white/85">
            {label}
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  supporting,
  value,
}: {
  icon: LucideIcon;
  label: string;
  supporting?: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex min-h-[72px] flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Icon className="h-4 w-4" />
          </div>
          <p className="min-w-0 text-sm font-semibold uppercase tracking-[0.04em] text-gray-600 dark:text-gray-300">
            {label}
          </p>
        </div>
        <div className="pl-12">
          <p className="text-[1.4rem] font-semibold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
          {supporting ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{supporting}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardSectionCard({
  actionLabel,
  children,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function DashboardSummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <Icon className="h-4 w-4" />
        </div>
        <span className="min-w-0 font-medium text-gray-700 dark:text-slate-200">{label}</span>
      </div>
      <strong className="shrink-0 text-base font-semibold text-gray-900 dark:text-white">
        {value}
      </strong>
    </div>
  );
}

export function ParcelamentoDashboard({
  installmentsPage,
  panoramasPage,
  isLoading,
  isError,
  onSelectTab,
}: ParcelamentoDashboardProps) {
  const summary = installmentsPage?.summary;
  const activeInstallments = summary?.active ?? 0;
  const overdueInstallments = summary?.overdue ?? 0;
  const totalInstallments = formatCount(installmentsPage?.total ?? 0, isLoading);
  const totalPanoramas = formatCount(panoramasPage?.total ?? 0, isLoading);
  const progressValue = isLoading ? "..." : `${summary?.progress_percent ?? 0}%`;

  if (isError) {
    return (
      <ParcelamentoStateBox
        icon={AlertCircle}
        title="Não foi possível carregar o dashboard."
        description="Tente atualizar a página ou ajustar os filtros."
        tone="error"
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
        <DashboardHeroCard
          icon={BadgeDollarSign}
          label="Acompanhamento de parcelamentos"
          value={totalInstallments}
          description="Resumo dos acordos retornados no filtro atual, com status, atrasos e progresso de pagamento."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricTile
            icon={CheckCircle2}
            label="Ativos"
            value={formatCount(activeInstallments, isLoading)}
            supporting="Parcelamentos ativos no filtro atual."
          />
          <MetricTile
            icon={Clock3}
            label="Em atraso"
            value={formatCount(overdueInstallments, isLoading)}
            supporting="Com parcelas vencidas no filtro atual."
          />
          <MetricTile
            icon={WalletCards}
            label="Panoramas"
            value={totalPanoramas}
            supporting="Panoramas no filtro atual."
          />
          <MetricTile
            icon={BarChart3}
            label="Progresso"
            value={progressValue}
            supporting="Parcelas pagas sobre acordadas."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
        <DashboardSectionCard
          title="Parcelamentos"
          description="Leitura rápida dos acordos carregados para o filtro atual."
          actionLabel="Ver lista"
          onAction={() => onSelectTab("installments")}
        >
          <div className="space-y-3">
            <DashboardSummaryRow icon={BadgeDollarSign} label="Total" value={totalInstallments} />
            <DashboardSummaryRow
              icon={CheckCircle2}
              label="Ativos"
              value={formatCount(activeInstallments, isLoading)}
            />
            <DashboardSummaryRow
              icon={Clock3}
              label="Em atraso"
              value={formatCount(overdueInstallments, isLoading)}
            />
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title="Panoramas"
          description="Sinais mensais consolidados para acompanhamento operacional."
          actionLabel="Ver panoramas"
          onAction={() => onSelectTab("panoramas")}
        >
          <div className="space-y-3">
            <DashboardSummaryRow icon={WalletCards} label="Total" value={totalPanoramas} />
            <DashboardSummaryRow icon={CheckCircle2} label="Progresso" value={progressValue} />
          </div>
        </DashboardSectionCard>
      </div>
    </section>
  );
}

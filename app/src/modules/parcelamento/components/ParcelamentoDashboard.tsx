import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Clock3,
  WalletCards,
} from "lucide-react";

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

interface DashboardKpiProps {
  label: string;
  value: string;
  description: string;
  icon: typeof BadgeDollarSign;
}

function formatCount(value: number, isLoading: boolean) {
  return isLoading ? "..." : String(value);
}

function getAverageProgress(items: ParcelamentoInstallment[]) {
  const progressItems = items.filter((item) => item.agreed_installments_count > 0);

  if (progressItems.length === 0) {
    return 0;
  }

  const totalProgress = progressItems.reduce((sum, item) => {
    return sum + item.paid_installments_count / item.agreed_installments_count;
  }, 0);

  return Math.round((totalProgress / progressItems.length) * 100);
}

function DashboardKpi({ label, value, description, icon: Icon }: DashboardKpiProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
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
  const installmentItems = installmentsPage?.items ?? [];
  const panoramaItems = panoramasPage?.items ?? [];
  const activeInstallments = installmentItems.filter((item) => item.status === "Ativo").length;
  const overdueInstallments = installmentItems.filter(
    (item) => item.overdue_installments_count > 0,
  ).length;
  const averageProgress = getAverageProgress(installmentItems);

  if (isError) {
    return (
      <ParcelamentoStateBox
        icon={AlertCircle}
        title="Nao foi possivel carregar o dashboard."
        description="Tente atualizar a pagina ou ajustar os filtros."
        tone="error"
      />
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpi
          label="Parcelamentos"
          value={formatCount(installmentsPage?.total ?? 0, isLoading)}
          description="Total retornado pelo endpoint."
          icon={BadgeDollarSign}
        />
        <DashboardKpi
          label="Ativos"
          value={formatCount(activeInstallments, isLoading)}
          description="Ativos na pagina carregada."
          icon={CheckCircle2}
        />
        <DashboardKpi
          label="Em atraso"
          value={formatCount(overdueInstallments, isLoading)}
          description="Com parcelas vencidas na pagina."
          icon={Clock3}
        />
        <DashboardKpi
          label="Panoramas"
          value={formatCount(panoramasPage?.total ?? 0, isLoading)}
          description={`${formatCount(panoramaItems.length, isLoading)} itens nesta pagina.`}
          icon={WalletCards}
        />
      </div>

      <aside className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Progresso medio
        </p>
        <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
          {isLoading ? "..." : `${averageProgress}%`}
        </p>
        <progress className="mt-3 h-2 w-full" value={averageProgress} max={100} />
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onSelectTab("installments")}
            className="inline-flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Ver parcelamentos
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("panoramas")}
            className="inline-flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Ver panoramas
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </section>
  );
}

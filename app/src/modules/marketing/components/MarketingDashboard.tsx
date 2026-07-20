import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Megaphone,
  RefreshCw,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MarketingDashboardStats } from "../types";

interface MarketingDashboardProps {
  stats: MarketingDashboardStats | null;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  purchased: "Comprado",
  rejected: "Rejeitado",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function MarketingStatePanel({
  description,
  isLoading = false,
  onRetry,
  title,
}: {
  description: string;
  isLoading?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  const Icon = isLoading ? Loader2 : AlertCircle;

  return (
    <div className="flex min-h-44 items-start gap-3 rounded-lg border border-gray-200 bg-white px-5 py-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isLoading ? "animate-spin" : ""}`} />
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 leading-6">{description}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MarketingMetricCard({
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex min-h-24 flex-col justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <Icon className="h-4 w-4" />
          </div>
          <p className="min-w-0 text-sm font-semibold text-gray-600 dark:text-slate-300">
            {label}
          </p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-normal text-gray-900 dark:text-white">
            {value}
          </p>
          {supporting ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{supporting}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MarketingSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MarketingDashboard({
  stats,
  isError,
  isLoading,
  onRetry,
}: MarketingDashboardProps) {
  if (isLoading) {
    return (
      <MarketingStatePanel
        isLoading
        title="Carregando Marketing"
        description="Buscando os indicadores reais de orçamentos e credenciais de Marketing."
      />
    );
  }

  if (isError) {
    return (
      <MarketingStatePanel
        title="Não foi possível carregar o Marketing"
        description="A consulta aos dados reais de Marketing não foi concluída."
        onRetry={onRetry}
      />
    );
  }

  if (!stats) {
    return (
      <MarketingStatePanel
        title="Nenhum dado disponível"
        description="Ainda não há indicadores de Marketing para exibir."
      />
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white">
            <Megaphone className="h-5 w-5" />
          </span>
          Departamento de Marketing
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Indicadores consolidados a partir dos orçamentos e acessos cadastrados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MarketingMetricCard
          icon={WalletCards}
          label="Orçamentos"
          value={formatNumber(stats.summary.totalBudgets)}
          supporting={`${formatNumber(stats.summary.pendingBudgets)} pendentes`}
        />
        <MarketingMetricCard
          icon={CheckCircle2}
          label="Aprovados"
          value={formatNumber(stats.summary.approvedBudgets)}
          supporting={`${formatNumber(stats.summary.purchasedBudgets)} comprados`}
        />
        <MarketingMetricCard
          icon={TrendingUp}
          label="Valor previsto"
          value={formatCurrency(stats.summary.totalBudgetValue)}
          supporting={`${formatNumber(stats.summary.rejectedBudgets)} rejeitados`}
        />
        <MarketingMetricCard
          icon={KeyRound}
          label="Acessos MKT"
          value={formatNumber(stats.summary.marketingPasswords)}
          supporting="Credenciais cadastradas"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MarketingSection title="Gastos por destino">
          {stats.spendingByDestination.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.spendingByDestination}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="destination" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="total" name="Valor" fill="#e11d48" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Nenhum gasto de Marketing encontrado.
            </p>
          )}
        </MarketingSection>

        <MarketingSection title="Orçamentos por status">
          <div className="space-y-3">
            {stats.budgetsByStatus.length > 0 ? (
              stats.budgetsByStatus.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <span className="min-w-0 font-medium text-gray-700 dark:text-slate-200">
                    {getStatusLabel(item.status)}
                  </span>
                  <strong className="shrink-0 text-gray-900 dark:text-white">
                    {formatNumber(item.count)}
                  </strong>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhum orçamento encontrado.
              </p>
            )}
          </div>
        </MarketingSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MarketingSection title="Orçamentos recentes">
          <div className="space-y-3">
            {stats.recentBudgets.length > 0 ? (
              stats.recentBudgets.map((budget) => (
                <div
                  key={budget.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {budget.title}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {formatDate(budget.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(budget.totalValue)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {getStatusLabel(budget.status)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhum orçamento recente encontrado.
              </p>
            )}
          </div>
        </MarketingSection>

        <MarketingSection title="Acessos de Marketing">
          <div className="space-y-3">
            {stats.marketingPasswords.recent.length > 0 ? (
              stats.marketingPasswords.recent.map((password) => (
                <div
                  key={password.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {password.local}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {password.user}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400">
                    {formatDate(password.updatedAt)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhum acesso de Marketing encontrado.
              </p>
            )}
          </div>
        </MarketingSection>
      </div>
    </section>
  );
}

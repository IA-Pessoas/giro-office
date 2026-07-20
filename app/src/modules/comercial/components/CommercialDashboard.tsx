import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
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

import type { CommercialDashboardStats } from "../types";

interface CommercialDashboardProps {
  stats: CommercialDashboardStats | null;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function CommercialStatePanel({
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

function CommercialMetricCard({
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
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

function CommercialSection({
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

export function CommercialDashboard({
  stats,
  isError,
  isLoading,
  onRetry,
}: CommercialDashboardProps) {
  if (isLoading) {
    return (
      <CommercialStatePanel
        isLoading
        title="Carregando Comercial"
        description="Buscando os indicadores comerciais consolidados."
      />
    );
  }

  if (isError) {
    return (
      <CommercialStatePanel
        title="Não foi possível carregar o Comercial"
        description="A consulta aos dados reais do Comercial não foi concluída."
        onRetry={onRetry}
      />
    );
  }

  if (!stats) {
    return (
      <CommercialStatePanel
        title="Nenhum dado disponível"
        description="Ainda não há indicadores comerciais para exibir."
      />
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Target className="h-5 w-5" />
          </span>
          Departamento Comercial
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Indicadores consolidados a partir de clientes e cobranças comerciais.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CommercialMetricCard
          icon={Users}
          label="Clientes em prospecção"
          value={formatNumber(stats.summary.prospectingClients)}
          supporting={`${formatNumber(stats.summary.totalClients)} clientes no total`}
        />
        <CommercialMetricCard
          icon={CheckCircle2}
          label="Clientes fechados"
          value={formatNumber(stats.summary.closedClients)}
          supporting={`${formatPercent(stats.summary.conversionRate)} de conversão`}
        />
        <CommercialMetricCard
          icon={BriefcaseBusiness}
          label="Clientes ativos"
          value={formatNumber(stats.summary.activeClients)}
          supporting={`${formatNumber(stats.summary.inactiveClients)} inativos`}
        />
        <CommercialMetricCard
          icon={ClipboardList}
          label="Tarefas comerciais"
          value={formatNumber(stats.summary.commercialTasks)}
          supporting={`${formatNumber(stats.summary.openCommercialTasks)} em aberto`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CommercialSection title="Funil comercial">
          {stats.funnel.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.funnel}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Clientes" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum status encontrado.</p>
          )}
        </CommercialSection>

        <CommercialSection title="Cobranças comerciais por status">
          <div className="space-y-3">
            {stats.commercialTasks.byStatus.length > 0 ? (
              stats.commercialTasks.byStatus.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <span className="min-w-0 font-medium text-gray-700 dark:text-slate-200">
                    {item.status}
                  </span>
                  <strong className="shrink-0 text-gray-900 dark:text-white">
                    {formatNumber(item.count)}
                  </strong>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhuma cobrança comercial encontrada.
              </p>
            )}
          </div>
        </CommercialSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CommercialSection title="Prospecções recentes">
          <div className="space-y-3">
            {stats.recentProspects.length > 0 ? (
              stats.recentProspects.map((prospect) => (
                <div
                  key={prospect.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {prospect.name}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {prospect.company}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {prospect.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhuma prospecção encontrada.
              </p>
            )}
          </div>
        </CommercialSection>

        <CommercialSection title="Tarefas comerciais recentes">
          <div className="space-y-3">
            {stats.commercialTasks.recent.length > 0 ? (
              stats.commercialTasks.recent.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 text-sm dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{task.name}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      {task.hiringStatus ?? "Sem status de contratação"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    {task.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Nenhuma tarefa comercial encontrada.
              </p>
            )}
          </div>
        </CommercialSection>
      </div>

      <CommercialSection title="Resumo operacional">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-gray-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">
              Cobranças abertas
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {formatNumber(stats.commercialTasks.open)}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">
              Cobranças concluídas
            </p>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {formatNumber(stats.commercialTasks.completed)}
            </p>
          </div>
          <div className="rounded-md border border-gray-200 px-4 py-3 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">
              Conversão comercial
            </p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-white">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              {formatPercent(stats.summary.conversionRate)}
            </p>
          </div>
        </div>
      </CommercialSection>
    </section>
  );
}

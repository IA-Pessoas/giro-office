import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Boxes,
  ClipboardList,
  Loader2,
  PackageSearch,
  Ticket,
} from "lucide-react";

import { useTiDashboard } from "../hooks";

function formatMetric(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("pt-BR");
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return "--";
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
  value: number | string;
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
  value: number | string;
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
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 min-w-0">
        <h3 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
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
  value: number | string;
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

function DashboardStatePanel({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex min-h-32 items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 leading-6">{description}</p>
      </div>
    </div>
  );
}

export function TiDashboardTab() {
  const dashboardQuery = useTiDashboard();
  const summary = dashboardQuery.data;
  const isLoading = dashboardQuery.isLoading || dashboardQuery.isFetching;
  const isEmpty = !summary || Object.keys(summary).length === 0;
  const openRequests = Number(summary?.requests_open ?? 0);
  const inProgressRequests = Number(summary?.requests_in_progress ?? 0);
  const closedRequests = Number(summary?.requests_closed ?? 0);

  if (isLoading) {
    return (
      <DashboardStatePanel
        icon={Loader2}
        title="Carregando dados..."
        description="Buscando o resumo consolidado de Tecnologia."
      />
    );
  }

  if (dashboardQuery.isError) {
    return (
      <DashboardStatePanel
        icon={AlertCircle}
        title="Não foi possível carregar."
        description={dashboardQuery.error?.message ?? "Tente novamente."}
      />
    );
  }

  if (isEmpty) {
    return (
      <DashboardStatePanel
        icon={BarChart3}
        title="Nenhum indicador encontrado."
        description="Quando houver dados de Tecnologia, os principais sinais operacionais aparecem aqui."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
        <DashboardHeroCard
          icon={ClipboardList}
          label={openRequests > 0 ? "Chamados em acompanhamento" : "Fluxo operacional em dia"}
          value={formatMetric(openRequests)}
          description={
            openRequests > 0
              ? "Chamados que ainda exigem acompanhamento, retorno ou conclusão dentro de Tecnologia."
              : "Nenhum chamado aberto no momento. Novas demandas passam a aparecer aqui quando entrarem no fluxo."
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricTile
            icon={Ticket}
            label="Em atendimento"
            value={formatMetric(summary?.requests_in_progress)}
            supporting={`${closedRequests.toLocaleString("pt-BR")} chamados fechados`}
          />
          <MetricTile icon={Boxes} label="Ativos" value={formatMetric(summary?.inventory_total)} />
          <MetricTile
            icon={PackageSearch}
            label="Estoque crítico"
            value={formatMetric(summary?.stock_low_count)}
          />
          <MetricTile icon={Bot} label="Robôs ativos" value={formatMetric(summary?.robots_active)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
        <DashboardSectionCard
          title="Chamados"
          description="Leitura rápida do atendimento carregado no resumo operacional."
        >
          <div className="space-y-3">
            <DashboardSummaryRow icon={Ticket} label="Abertos" value={formatMetric(openRequests)} />
            <DashboardSummaryRow
              icon={BarChart3}
              label="Em atendimento"
              value={formatMetric(inProgressRequests)}
            />
            <DashboardSummaryRow
              icon={ClipboardList}
              label="Fechados"
              value={formatMetric(closedRequests)}
            />
          </div>
        </DashboardSectionCard>

        <DashboardSectionCard
          title="Operação"
          description="Sinais consolidados de ativos, estoque e automações."
        >
          <div className="space-y-3">
            <DashboardSummaryRow
              icon={Boxes}
              label="Ativos"
              value={formatMetric(summary?.inventory_total)}
            />
            <DashboardSummaryRow
              icon={PackageSearch}
              label="Estoque"
              value={formatMetric(summary?.stock_low_count)}
            />
            <DashboardSummaryRow
              icon={Bot}
              label="Robôs"
              value={formatMetric(summary?.robots_active)}
            />
          </div>
        </DashboardSectionCard>
      </div>
    </section>
  );
}

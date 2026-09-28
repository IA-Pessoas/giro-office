import { AlertCircle, Cake, Loader2, Megaphone } from "lucide-react";

import { useMarketingDashboard } from "../hooks/useMarketingDashboard";

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function DashboardState({
  title,
  description,
  loading = false,
  onRetry,
}: {
  title: string;
  description: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const Icon = loading ? Loader2 : AlertCircle;
  return (
    <div
      className="flex min-h-32 items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      role={loading ? "status" : "alert"}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
      <div>
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-1 leading-6">{description}</p>
        {onRetry ? (
          <button
            className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
            onClick={onRetry}
            type="button"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0 dark:border-slate-700">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{detail}</p>
      </div>
      <strong className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
        {formatNumber(value)}
      </strong>
    </div>
  );
}

function BirthdaySection({
  title,
  items,
  total,
}: {
  title: string;
  items: Array<{ id: string; name: string; day: number }>;
  total: number;
}) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          Nenhum registro para os próximos dias deste mês.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-slate-700">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate text-gray-700 dark:text-slate-200">{item.name}</span>
              <time className="shrink-0 text-gray-500 dark:text-slate-400" dateTime={`--${String(item.day).padStart(2, "0")}`}>
                Dia {item.day}
              </time>
            </li>
          ))}
        </ul>
      )}
      {total > items.length ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          Exibindo {items.length} de {formatNumber(total)} registros.
        </p>
      ) : null}
    </section>
  );
}

export function MarketingDashboard() {
  const query = useMarketingDashboard();
  const summary = query.data;

  if (query.isLoading) {
    return (
      <DashboardState
        loading
        title="Carregando dados"
        description="Buscando o resumo de solicitações e datas importantes da organização."
      />
    );
  }

  if (query.isError) {
    return (
      <DashboardState
        title="Não foi possível carregar"
        description="Tente novamente em instantes. Nenhum dado de demonstração é exibido."
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!summary) {
    return (
      <DashboardState
        title="Nenhum dado disponível"
        description="O resumo ainda não tem dados para esta organização."
      />
    );
  }

  const noData =
    summary.requests.active.total === 0 &&
    summary.birthdays.clients.total === 0 &&
    summary.birthdays.employees.total === 0 &&
    summary.birthdays.companies.total === 0;

  if (noData) {
    return (
      <DashboardState
        title="Nenhum dado disponível"
        description="Ainda não há solicitações ou datas importantes para exibir nesta organização."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Solicitações existentes</h2>
        </div>
        <p className="mb-2 text-sm text-gray-500 dark:text-slate-400">
          Contagens consolidadas de RH e TI. Este painel não cria nem altera solicitações.
        </p>
        <MetricRow
          label="Em andamento"
          value={summary.requests.active.total}
          detail={`RH ${formatNumber(summary.requests.active.rh)} · TI ${formatNumber(summary.requests.active.ti)}`}
        />
        <MetricRow
          label="Novas"
          value={summary.requests.new.total}
          detail={`RH ${formatNumber(summary.requests.new.rh)} · TI ${formatNumber(summary.requests.new.ti)}`}
        />
        <MetricRow
          label="Urgentes"
          value={summary.requests.urgent.total}
          detail={`RH ${formatNumber(summary.requests.urgent.rh)} · TI ${formatNumber(summary.requests.urgent.ti)}`}
        />
        <ul className="mt-3 space-y-1" aria-label="Avisos">
          {summary.alerts.map((alert) => (
            <li key={alert.code} className="text-sm text-amber-700 dark:text-amber-300">
              {alert.label}: {formatNumber(alert.count)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <Cake className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Datas importantes</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">Próximos registros deste mês.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <BirthdaySection title="Aniversários de clientes" {...summary.birthdays.clients} />
          <BirthdaySection title="Aniversários da equipe" {...summary.birthdays.employees} />
          <BirthdaySection title="Aniversários das empresas" {...summary.birthdays.companies} />
        </div>
      </section>
    </div>
  );
}

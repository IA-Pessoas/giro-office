import { AlertCircle, Cake, Download, Loader2, Megaphone } from "lucide-react";

import { useMarketingDashboard } from "../hooks/useMarketingDashboard";
import { createBirthdayCsv, downloadCsvFile } from "../utils/birthdayCsv";

function downloadBirthdays(
  filename: string,
  items: readonly { name: string; day: number }[],
): void {
  downloadCsvFile(filename, createBirthdayCsv(items));
}

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
  onExport,
}: {
  title: string;
  items: Array<{ id: string; name: string; day: number }>;
  total: number;
  onExport?: () => void;
}) {
  const visibleItems = items.slice(0, 8);
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {onExport && items.length > 0 ? (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exportar CSV
          </button>
        ) : null}
      </div>
      {visibleItems.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          Nenhum registro para os próximos dias deste mês.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-slate-700">
          {visibleItems.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate text-gray-700 dark:text-slate-200">{item.name}</span>
              <time className="shrink-0 text-gray-500 dark:text-slate-400" dateTime={`--${String(item.day).padStart(2, "0")}`}>
                Dia {item.day}
              </time>
            </li>
          ))}
        </ul>
      )}
      {total > visibleItems.length ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          Exibindo {visibleItems.length} de {formatNumber(total)} registros.
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
    summary.birthdays.companies.total === 0 &&
    summary.aiUsage.pendingKnowledge === 0;

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
      {summary.aiUsage.pendingKnowledge > 0 ? (
        <div
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>{formatNumber(summary.aiUsage.pendingKnowledge)}</strong> {summary.aiUsage.pendingKnowledge === 1 ? "resposta" : "respostas"} sobre
            conhecimento de IA estão pendentes nesta competência.
          </p>
        </div>
      ) : null}
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
          {summary.alerts
            .filter((alert) => alert.code !== "pending-ai-knowledge")
            .map((alert) => (
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
          <BirthdaySection
            title="Aniversários de clientes"
            {...summary.birthdays.clients}
            onExport={() => downloadBirthdays("aniversarios-clientes.csv", summary.birthdays.clients.items)}
          />
          <BirthdaySection
            title="Aniversários da equipe"
            {...summary.birthdays.employees}
            onExport={() => downloadBirthdays("aniversarios-colaboradores.csv", summary.birthdays.employees.items)}
          />
          <BirthdaySection title="Aniversários das empresas" {...summary.birthdays.companies} />
        </div>
      </section>
    </div>
  );
}

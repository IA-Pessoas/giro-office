import { AlertCircle, Cake, Download, Loader2, Megaphone, Printer } from "lucide-react";
import { useState } from "react";

import { useMarketingDashboard } from "../hooks/useMarketingDashboard";
import type { BirthdayItem } from "../types/marketingDashboard";
import { createBirthdayCsv } from "../utils/birthdayCsv";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function downloadBirthdays(filename: string, items: ReturnType<typeof reportItems>): void {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${createBirthdayCsv(items)}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function reportItems(clients: BirthdayItem[], employees: BirthdayItem[]) {
  return [
    ...clients.map((item) => ({ type: "Cliente PF", name: item.name, date: item.date, department: "" })),
    ...employees.map((item) => ({
      type: "Colaborador",
      name: item.name,
      date: item.date,
      department: item.department ?? "Sem departamento",
    })),
  ].sort((a, b) => {
    const [dayA, monthA] = a.date.split("/").map(Number);
    const [dayB, monthB] = b.date.split("/").map(Number);
    return monthA - monthB || dayA - dayB || a.name.localeCompare(b.name, "pt-BR");
  });
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00`),
  );
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

function BirthdayList({
  title,
  items,
  showDepartment = false,
}: {
  title: string;
  items: BirthdayItem[];
  showDepartment?: boolean;
}) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          Nenhum aniversário neste mês.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-slate-700">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate text-gray-700 dark:text-slate-200">
                {item.name}
                {showDepartment ? (
                  <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">
                    · {item.department ?? "Sem departamento"}
                  </span>
                ) : null}
              </span>
              <time className="shrink-0 text-gray-500 dark:text-slate-400">{item.date}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MarketingDashboard() {
  const [month, setMonth] = useState(currentMonth);
  const query = useMarketingDashboard(month);
  const summary = query.data;

  if (query.isLoading) {
    return (
      <DashboardState
        loading
        title="Carregando dados"
        description="Buscando o resumo de solicitações e aniversários da organização."
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

  const rows = reportItems(summary.birthdays.clients.items, summary.birthdays.employees.items);

  return (
    <div className="space-y-6">
      {summary.aiUsage.pendingKnowledge > 0 ? (
        <div
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 print:hidden"
          role="status"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>{formatNumber(summary.aiUsage.pendingKnowledge)}</strong>{" "}
            {summary.aiUsage.pendingKnowledge === 1 ? "resposta" : "respostas"} sobre conhecimento
            de IA estão pendentes nesta competência.
          </p>
        </div>
      ) : null}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 print:hidden">
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

      <section
        id="marketing-birthday-report"
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 print:border-0 print:p-0 print:shadow-none"
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-blue-600 dark:text-blue-300 print:hidden" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Aniversários</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">{formatMonth(month)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <label className="sr-only" htmlFor="marketing-birthday-month">Mês dos aniversários</label>
            <input
              id="marketing-birthday-month"
              aria-label="Mês dos aniversários"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              type="month"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
            />
            <button
              type="button"
              onClick={() => downloadBirthdays(`aniversarios-${month}.csv`, rows)}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir
            </button>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <BirthdayList title="Clientes PF" items={summary.birthdays.clients.items} />
          <BirthdayList
            title="Colaboradores"
            items={summary.birthdays.employees.items}
            showDepartment
          />
        </div>
      </section>

      {summary.birthdays.companies.total > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 print:hidden">
          <BirthdayList title="Aniversários das empresas" items={summary.birthdays.companies.items} />
        </section>
      ) : null}
    </div>
  );
}

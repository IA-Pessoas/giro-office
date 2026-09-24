import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, RotateCcw } from "lucide-react";

import { PaginationControls } from "@shared/components";
import { getContabilErrorMessage } from "@modules/contabil";

import { useTriageOverview } from "../hooks";
import type {
  TriageOverviewIndicators,
  TriageOverviewStatus,
} from "../services/triagemOverviewService";
import { formatTriageCompetence } from "./triagem.helpers";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<TriageOverviewStatus, string> = {
  URGENT_OPEN: "Urgente aberta",
  ROUTINE_PENDING: "Rotina pendente",
  BANK_PENDING: "Banco pendente",
  COMPLETE: "Completa",
  NO_APPLICABLE_ITEMS: "Sem itens aplicáveis",
};

const INDICATOR_KEYS: Record<TriageOverviewStatus, keyof TriageOverviewIndicators> = {
  URGENT_OPEN: "urgent_open",
  ROUTINE_PENDING: "routine_pending",
  BANK_PENDING: "bank_pending",
  COMPLETE: "complete",
  NO_APPLICABLE_ITEMS: "no_applicable_items",
};

const STATUS_OPTIONS: Array<{ value: TriageOverviewStatus | ""; label: string }> = [
  { value: "", label: "Todos os status" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value: value as TriageOverviewStatus,
    label,
  })),
];

export function TriageOverviewPanel({ clientId }: { clientId?: string }) {
  const [competence, setCompetence] = useState("");
  const [status, setStatus] = useState<TriageOverviewStatus | "">("");
  const [page, setPage] = useState(1);
  const overview = useTriageOverview({
    page,
    pageSize: PAGE_SIZE,
    clientId,
    competence: competence || undefined,
    status: status || undefined,
  });
  const result = overview.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : undefined;

  useEffect(() => {
    setPage(1);
  }, [clientId, competence, status]);

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="triage-overview-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="triage-overview-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Painel operacional
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Uma linha por cliente e competência, com a situação das solicitações urgentes, da rotina e dos extratos.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            <span className="flex items-center gap-1"><CalendarDays aria-hidden="true" className="h-4 w-4 text-blue-600" /> Competência</span>
            <input
              aria-label="Competência do painel"
              type="month"
              value={competence}
              onChange={(event) => setCompetence(event.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            Status
            <select
              aria-label="Status do painel"
              value={status}
              onChange={(event) => setStatus(event.target.value as TriageOverviewStatus | "")}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {result ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Indicadores do painel">
          {(Object.entries(STATUS_LABELS) as Array<[TriageOverviewStatus, string]>).map(([key, label]) => (
            <div
              key={key}
              aria-label={`${label}: ${(result.indicators[INDICATOR_KEYS[key]] ?? 0)}`}
              className="rounded-lg border border-gray-200 p-3 dark:border-slate-700"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{(result.indicators[INDICATOR_KEYS[key]] ?? 0)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {overview.isLoading ? <p className="text-sm text-slate-500" role="status">Carregando painel operacional...</p> : null}

      {overview.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200" role="alert">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Não foi possível carregar o painel.</div>
          <p className="mt-1">{getContabilErrorMessage(overview.error)}</p>
          <button type="button" onClick={() => void overview.refetch()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/30">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      ) : null}

      {!overview.isLoading && !overview.isError && result && result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-400" role="status">
          Nenhuma competência elegível encontrada com os filtros atuais.
        </p>
      ) : null}

      {!overview.isLoading && !overview.isError && result && result.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
            <caption className="sr-only">Painel operacional consolidado da Triagem</caption>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                <th scope="col" className="px-4 py-3 font-semibold">Competência</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {result.items.map((item) => (
                <tr key={`${item.client_id}:${item.competence}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.legal_name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{formatTriageCompetence(item.competence)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{STATUS_LABELS[item.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls
            page={page}
            limit={result.page_size}
            total={result.total}
            count={result.items.length}
            hasMore={page < (totalPages ?? 1)}
            isFetching={overview.isFetching}
            totalPages={totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </section>
  );
}

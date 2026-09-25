import { Eye, Loader2, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@shared/services/toast";

import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers } from "@modules/rh/hooks/useAssignableUsers";
import { PaginationControls } from "@shared/components";
import { StatusBadge } from "@shared/components/StatusBadge";

import { useCancelReportJobMutation, useReportHistory } from "../hooks/useReports";
import type { ReportHistoryItem, ReportHistoryScope, ReportJobStatus } from "../types/report.types";
import {
  formatReportDate,
  getErrorStatus,
  getReportAuthorLabel,
  getReportStatusConfig,
  panelClassName,
} from "./reportUi";
import { ReportSnapshotTable } from "./ReportSnapshotTable";

const statusOptions: Array<{ value: ReportJobStatus | ""; label: string }> = [
  { value: "", label: "Todos os estados" },
  { value: "queued", label: "Na fila" },
  { value: "processing", label: "Processando" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
  { value: "failed", label: "Falhou" },
  { value: "expired", label: "Expirado" },
];

function isActiveJob(item: ReportHistoryItem) {
  return item.status === "queued" || item.status === "processing";
}

export function ReportHistoryPanel({ scope, onAccessDenied }: { scope: ReportHistoryScope; onAccessDenied?: () => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReportJobStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<Array<number | undefined>>([]);
  const [selectedJob, setSelectedJob] = useState<ReportHistoryItem | null>(null);
  const seenStatusesRef = useRef<Map<string, ReportJobStatus>>(new Map());
  const historyQuery = useReportHistory({ scope, status: status || undefined, from, to, cursor });
  const cancelMutation = useCancelReportJobMutation();
  const items = historyQuery.data?.items ?? [];
  const { user } = useAuth();
  // No histórico pessoal o autor é sempre o próprio usuário; o catálogo só é buscado no acervo.
  const usersQuery = useAssignableUsers({ enabled: scope === "library" });
  const namesById = useMemo(
    () => new Map((usersQuery.data ?? []).map((person) => [person.id, person.name])),
    [usersQuery.data],
  );

  useEffect(() => {
    if (getErrorStatus(historyQuery.error) === 403) onAccessDenied?.();
  }, [historyQuery.error, onAccessDenied]);

  useEffect(() => {
    if (scope !== "personal" || !historyQuery.data) return;
    const seenStatuses = seenStatusesRef.current;
    for (const item of historyQuery.data.items) {
      const previousStatus = seenStatuses.get(item.id);
      if (previousStatus && previousStatus !== item.status && item.status === "completed") {
        toast.success(`${item.model_name ?? "Relatório"} concluído.`);
      }
      seenStatuses.set(item.id, item.status);
    }
  }, [historyQuery.data, scope]);

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return items;
    return items.filter((item) => [item.model_name, item.author_name, item.id].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch)));
  }, [items, search]);

  async function cancelJob(id: string) {
    try {
      await cancelMutation.mutateAsync(id);
      toast.success("Cancelamento solicitado.");
    } catch {
      toast.error("Não foi possível cancelar o job.");
    }
  }

  function applyFilters() {
    setCursor(undefined);
    setPage(1);
    setCursorStack([]);
  }

  function nextPage() {
    if (historyQuery.data?.nextCursor === null || historyQuery.data?.nextCursor === undefined) return;
    setCursorStack((current) => [...current, cursor]);
    setCursor(historyQuery.data.nextCursor);
    setPage((current) => current + 1);
  }

  function previousPage() {
    const nextStack = [...cursorStack];
    const previousCursor = nextStack.pop();
    setCursorStack(nextStack);
    setCursor(previousCursor);
    setPage((current) => Math.max(1, current - 1));
  }

  return (
    <section className={panelClassName} aria-labelledby={`reports-${scope}-title`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><h2 id={`reports-${scope}-title`} className="text-lg font-semibold text-gray-900 dark:text-white">{scope === "personal" ? "Histórico pessoal" : "Acervo"}</h2><p className="mt-1 text-sm text-gray-600 dark:text-slate-400">Acompanhe o estado, autoria, horários, versão e expiração dos jobs.</p></div>
        <div className="flex flex-wrap items-center gap-2"><label className="relative"><span className="sr-only">Buscar no histórico</span><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar" className="h-9 w-44 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm dark:border-gray-700 dark:bg-slate-900" /></label><select value={status} onChange={(event) => setStatus(event.target.value as ReportJobStatus | "")} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-slate-900">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60"><label className="text-xs text-gray-600 dark:text-slate-400">A partir de<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-slate-900" /></label><label className="text-xs text-gray-600 dark:text-slate-400">Até<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-slate-900" /></label><button type="button" onClick={applyFilters} className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">Aplicar filtros</button></div>
      {historyQuery.isPending ? <div className="flex items-center gap-3 py-8 text-sm text-gray-600 dark:text-slate-400" role="status"><Loader2 className="h-5 w-5 animate-spin" /> Carregando histórico...</div> : null}
      {historyQuery.isError && getErrorStatus(historyQuery.error) !== 403 ? <p role="alert" className="py-5 text-sm text-red-600 dark:text-red-400">Não foi possível carregar este histórico.</p> : null}
      {!historyQuery.isPending && !historyQuery.isError ? <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"><table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700"><caption className="sr-only">Histórico de relatórios gerados</caption><thead className="bg-gray-50 dark:bg-gray-800/70"><tr>{["Relatório", "Estado", "Autor", "Solicitado em", "Finalizado em", "Versão", "Expira em", "Ações"].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{visibleItems.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.model_name ?? "Relatório"}<span className="block text-[11px] font-normal text-gray-500">{item.id}</span></td><td className="px-4 py-3"><StatusBadge config={getReportStatusConfig(item.status)} size="sm" />{item.status === "failed" && item.error_message ? <span className="mt-1 block max-w-xs text-xs text-red-700 dark:text-red-300">{item.error_message}</span> : null}</td><td className="px-4 py-3 text-gray-700 dark:text-gray-300">{getReportAuthorLabel(item, namesById, user)}</td><td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{formatReportDate(item.requested_at)}</td><td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{formatReportDate(item.finished_at)}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.model_version ?? "—"}</td><td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{formatReportDate(item.expires_at)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{item.status === "completed" ? <button type="button" onClick={() => setSelectedJob(item)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Eye className="h-3.5 w-3.5" /> Ver resultado</button> : null}{scope === "personal" && isActiveJob(item) ? <button type="button" onClick={() => void cancelJob(item.id)} disabled={cancelMutation.isPending} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300"><XCircle className="h-3.5 w-3.5" /> Cancelar</button> : null}</div></td></tr>)}</tbody></table>{visibleItems.length === 0 ? <p className="p-5 text-sm text-gray-500 dark:text-slate-500" role="status">Nenhum relatório encontrado com os filtros atuais.</p> : null}<PaginationControls page={page} limit={20} total={visibleItems.length} count={visibleItems.length} hasMore={Boolean(historyQuery.data?.nextCursor)} isFetching={historyQuery.isFetching} onPrevious={previousPage} onNext={nextPage} /></div> : null}
      {selectedJob ? <ReportSnapshotTable job={selectedJob} scope={scope} onClose={() => setSelectedJob(null)} /> : null}
    </section>
  );
}

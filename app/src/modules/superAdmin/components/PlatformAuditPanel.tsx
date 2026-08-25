import { Activity, Search } from "lucide-react";
import { useState } from "react";

import { PaginationControls } from "@shared/components/ui/PaginationControls";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { Input } from "@shared/ui/newLayout/input";

import { usePlatformAudit } from "../hooks/usePlatformAudit";

const PAGE_SIZE = 25;

const OUTCOME_LABELS = {
  success: "Sucesso",
  error: "Erro",
  aborted: "Abortada",
} as const;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

export function PlatformAuditPanel() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const auditQuery = usePlatformAudit({
    page,
    pageSize: PAGE_SIZE,
    ...(debouncedSearch ? { path: debouncedSearch } : {}),
  });
  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="platform-audit-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
            Visão global
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white" id="platform-audit-title">
            Auditoria de requisições
          </h2>
        </div>
        <div className="w-full sm:max-w-xs">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="platform-audit-search">
            Pesquisar rota
          </label>
          <div className="relative mt-1.5">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="bg-white pl-9 dark:bg-slate-950"
              id="platform-audit-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Ex.: /user"
              type="search"
              value={search}
            />
          </div>
        </div>
      </div>

      <div className="min-h-[24rem] overflow-x-auto" aria-busy={auditQuery.isLoading || auditQuery.isFetching}>
        {auditQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500" role="status">
            Carregando auditoria...
          </div>
        ) : auditQuery.isError ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
            <p>Não foi possível carregar a auditoria.</p>
            <button className="mt-3 font-semibold underline underline-offset-4" onClick={() => void auditQuery.refetch()} type="button">
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Activity aria-hidden="true" className="h-7 w-7 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              Nenhum registro de auditoria encontrado
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Não há eventos para esta página ou filtro.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">Requisição</th>
                <th className="px-4 py-3 font-semibold" scope="col">Rota</th>
                <th className="px-4 py-3 font-semibold" scope="col">Serviço</th>
                <th className="px-4 py-3 font-semibold" scope="col">Resultado</th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">Horário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr className="text-slate-700 dark:text-slate-200" key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-slate-950 dark:text-white">{item.requestId}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.organizationId ?? "Plataforma"}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <p className="truncate"><span className="mr-2 font-semibold">{item.method}</span>{item.path}</p>
                  </td>
                  <td className="px-4 py-3">{item.serviceSource}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      item.outcome === "success"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                    }`}>
                      {OUTCOME_LABELS[item.outcome]}{item.statusCode ? ` · ${item.statusCode}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationControls
        count={items.length}
        hasMore={page < totalPages}
        isFetching={auditQuery.isFetching}
        limit={PAGE_SIZE}
        onFirst={() => setPage(1)}
        onLast={() => setPage(totalPages)}
        onNext={() => setPage((current) => current + 1)}
        onPageChange={setPage}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        page={page}
        total={total}
        totalPages={totalPages}
      />
    </section>
  );
}

import { Activity, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dialog } from "@shared/components/ui/Dialog";
import { PaginationControls } from "@shared/components/ui/PaginationControls";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { Input } from "@shared/ui/newLayout/input";

import { usePlatformAudit } from "../hooks/usePlatformAudit";
import type { PlatformAuditRecord, PlatformOrganization } from "../types";
import { formatAuditChanges } from "../utils/platformManagement";

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

export function PlatformAuditPanel({
  organization,
}: {
  organization: PlatformOrganization | null;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showGlobal, setShowGlobal] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<PlatformAuditRecord | null>(null);
  const auditActionRef = useRef<HTMLButtonElement>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const auditQuery = usePlatformAudit({
    page,
    pageSize: PAGE_SIZE,
    organizationId: showGlobal ? undefined : organization?.id,
    ...(debouncedSearch ? { path: debouncedSearch } : {}),
  });
  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isGlobalView = showGlobal || !organization;
  const selectedAuditChanges = selectedAudit ? formatAuditChanges(selectedAudit.changes) : [];

  useEffect(() => {
    setShowGlobal(false);
    setPage(1);
    setSelectedAudit(null);
  }, [organization?.id]);

  return (
    <section aria-labelledby="platform-audit-title" className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800"
      >
        <div>
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            {isGlobalView ? "Todas as organizações" : organization?.name}
          </p>
          <h2
            className="mt-1 text-lg font-semibold text-slate-950 dark:text-white"
            id="platform-audit-title"
          >
            Auditoria
          </h2>
          <label className="mt-3 flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              checked={isGlobalView}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/40"
              disabled={!organization}
              onChange={(event) => {
                setShowGlobal(event.target.checked);
                setPage(1);
              }}
              type="checkbox"
            />
            Mostrar auditoria global
          </label>
          {!organization ? (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Selecione uma organização para filtrar o histórico.
            </p>
          ) : null}
        </div>
        <div className="w-full sm:max-w-xs">
          <label
            className="block text-xs font-medium text-slate-600 dark:text-slate-300"
            htmlFor="platform-audit-search"
          >
            Pesquisar rota
          </label>
          <div className="relative mt-1.5">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              className="bg-white pl-9 dark:bg-slate-950"
              id="platform-audit-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Ex.: /platform/organizations"
              type="search"
              value={search}
            />
          </div>
        </div>
      </div>

      <div
        aria-busy={auditQuery.isLoading || auditQuery.isFetching}
        className="min-h-0 flex-1 overflow-auto lg:min-h-[24rem]"
      >
        {auditQuery.isLoading ? (
          <div
            className="flex min-h-72 items-center justify-center text-sm text-slate-500"
            role="status"
          >
            Carregando auditoria...
          </div>
        ) : auditQuery.isError ? (
          <div
            className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100"
            role="alert"
          >
            <p>Não foi possível carregar a auditoria.</p>
            <button
              className="mt-3 font-semibold underline underline-offset-4"
              onClick={() => void auditQuery.refetch()}
              type="button"
            >
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
          <table className="w-full table-fixed text-left text-sm">
            <thead className="sr-only sm:not-sr-only sm:table-header-group sm:bg-slate-50 sm:text-xs sm:text-slate-600 sm:dark:bg-slate-950/60 sm:dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Evento
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Ator
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Mudanças
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Resultado
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Horário
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-slate-100 dark:divide-slate-800 sm:table-row-group">
              {items.map((item) => {
                const changes = formatAuditChanges(item.changes);
                return (
                  <tr
                    className="grid gap-3 px-4 py-4 align-top text-slate-700 dark:text-slate-200 sm:table-row sm:px-0 sm:py-0"
                    key={item.id}
                  >
                    <td className="min-w-0 sm:w-[27%] sm:px-4 sm:py-3">
                      <p
                        aria-hidden="true"
                        className="mb-1 text-xs font-medium text-slate-500 sm:hidden"
                      >
                        Evento
                      </p>
                      <p className="break-words font-semibold text-slate-950 dark:text-white">
                        {item.action ?? `${item.method} ${item.path}`}
                      </p>
                      <p className="mt-0.5 break-all text-xs text-slate-600 dark:text-slate-300">
                        {item.referringId ?? item.path}
                      </p>
                      <button
                        aria-label={`Ver detalhes da ação ${item.action ?? `${item.method} ${item.path}`}`}
                        className="mt-3 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={(event) => {
                          auditActionRef.current = event.currentTarget;
                          setSelectedAudit(item);
                        }}
                        type="button"
                      >
                        Ver detalhes da ação
                      </button>
                    </td>
                    <td className="min-w-0 sm:w-[18%] sm:px-4 sm:py-3 sm:text-xs">
                      <p
                        aria-hidden="true"
                        className="mb-1 text-xs font-medium text-slate-500 sm:hidden"
                      >
                        Ator
                      </p>
                      <p className="break-all text-xs">{item.actorPlatformUserId ?? "Sistema"}</p>
                    </td>
                    <td className="min-w-0 sm:w-[27%] sm:px-4 sm:py-3 sm:text-xs">
                      <p
                        aria-hidden="true"
                        className="mb-1 text-xs font-medium text-slate-500 sm:hidden"
                      >
                        Mudanças
                      </p>
                      {changes.length ? (
                        <ul className="space-y-1 break-words text-xs">
                          {changes.map((change) => (
                            <li key={change}>{change}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">
                          Sem alteração de campo
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 sm:w-[14%] sm:px-4 sm:py-3">
                      <p
                        aria-hidden="true"
                        className="mb-1 text-xs font-medium text-slate-500 sm:hidden"
                      >
                        Resultado
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          item.outcome === "success"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                        }`}
                      >
                        {OUTCOME_LABELS[item.outcome]}
                        {item.statusCode ? ` · ${item.statusCode}` : ""}
                      </span>
                    </td>
                    <td className="min-w-0 text-left sm:w-[14%] sm:px-4 sm:py-3 sm:text-right">
                      <p
                        aria-hidden="true"
                        className="mb-1 text-xs font-medium text-slate-500 sm:hidden"
                      >
                        Horário
                      </p>
                      <p className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {formatDate(item.createdAt)}
                      </p>
                    </td>
                  </tr>
                );
              })}
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

      <Dialog
        contentClassName="!w-[min(96vw,720px)] !max-w-none"
        description="Informações adicionais do registro de auditoria selecionado."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          auditActionRef.current?.focus();
        }}
        onOpenChange={(open) => {
          if (!open) setSelectedAudit(null);
        }}
        open={selectedAudit !== null}
        title="Detalhes da ação"
      >
        {selectedAudit ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/70 dark:bg-blue-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                Ação selecionada
              </p>
              <p className="mt-1 break-words font-semibold text-slate-950 dark:text-white">
                {selectedAudit.action ?? `${selectedAudit.method} ${selectedAudit.path}`}
              </p>
            </div>

            <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Rota</dt>
                <dd className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.method} {selectedAudit.path}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Resultado</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {OUTCOME_LABELS[selectedAudit.outcome]}
                  {selectedAudit.statusCode ? ` · ${selectedAudit.statusCode}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Ator</dt>
                <dd className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.actorPlatformUserId ?? "Sistema"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Serviço</dt>
                <dd className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.serviceSource}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Duração</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.durationMs === null || selectedAudit.durationMs === undefined
                    ? "—"
                    : `${selectedAudit.durationMs} ms`}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Horário</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {formatDate(selectedAudit.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Referência</dt>
                <dd className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.referring ?? "—"}
                  {selectedAudit.referringId ? ` · ${selectedAudit.referringId}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Request ID</dt>
                <dd className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">
                  {selectedAudit.requestId}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Alterações</h3>
              {selectedAuditChanges.length ? (
                <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  {selectedAuditChanges.map((change) => (
                    <li className="break-words" key={change}>
                      {change}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Sem alteração de campo.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

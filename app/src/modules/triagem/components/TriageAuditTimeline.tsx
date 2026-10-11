import { History, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";

import { getContabilErrorMessage } from "@modules/contabil";

import { useTriageAudit } from "../hooks/useTriageAudit";

const ACTION_LABELS: Record<string, string> = {
  created: "Competência criada",
  archived: "Competência arquivada",
  restored: "Competência restaurada",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatContext(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

export function TriageAuditTimeline({ competenceId }: { competenceId: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const history = useTriageAudit(competenceId, open, page);
  const pageCount = history.data
    ? Math.max(1, Math.ceil(history.data.total / history.data.page_size))
    : 1;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600" aria-hidden="true" />
          Histórico de alterações
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="border-t border-gray-200 px-3 py-3 dark:border-slate-700">
          {history.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando histórico...
            </p>
          ) : null}

          {history.isError ? (
            <div className="text-sm text-red-700 dark:text-red-300" role="alert">
              <p>Não foi possível carregar o histórico. {getContabilErrorMessage(history.error)}</p>
              <button
                type="button"
                onClick={() => void history.refetch()}
                className="mt-2 inline-flex items-center gap-2 rounded-md border border-red-300 px-2 py-1 font-medium hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!history.isLoading && !history.isError && history.data?.items.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-slate-400" role="status">
              Nenhuma alteração registrada.
            </p>
          ) : null}

          {!history.isLoading && !history.isError && history.data?.items.length ? (
            <ol className="space-y-3" aria-label="Alterações da competência">
              {history.data.items.map((item) => (
                <li key={item.id} className="border-l-2 border-blue-200 pl-3 dark:border-blue-900">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {actionLabel(item.action)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {new Date(item.occurred_at).toLocaleString("pt-BR")} · {item.actor.full_name ?? item.actor.name}
                  </p>
                  <details className="mt-2 text-xs text-gray-600 dark:text-slate-400">
                    <summary className="cursor-pointer font-medium hover:text-gray-900 dark:hover:text-white">
                      Ver contexto
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium">Antes</p>
                        <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-[11px] dark:bg-slate-950">
                          {formatContext(item.context.before)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-medium">Depois</p>
                        <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-[11px] dark:bg-slate-950">
                          {formatContext(item.context.after)}
                        </pre>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          ) : null}

          {pageCount > 1 ? (
            <nav
              aria-label="Paginação do histórico da competência"
              className="mt-3 flex items-center justify-between gap-3 text-sm"
            >
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1 || history.isFetching}
                className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Anterior
              </button>
              <span className="text-gray-600 dark:text-slate-400">
                Página {page} de {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= pageCount || history.isFetching}
                className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Próxima
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

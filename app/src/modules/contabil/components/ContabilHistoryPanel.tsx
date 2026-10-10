import { AlertCircle, History, Loader2 } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";

import { formatDateTime } from "@shared/utils/dateFormat";

import { getContabilErrorMessage } from "../services";
import type { ContabilHistoryEntry } from "../types";
import { getContabilHistoryPageCount } from "./contabilHistory.helpers";
import { ContabilStateBox } from "./ContabilStateBox";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

interface ContabilHistoryPanelProps<F extends string, E extends ContabilHistoryEntry<F>> {
  titleId: string;
  title?: string;
  subtitle: string;
  emptyMessage: string;
  query: UseQueryResult<{ total: number; items: E[] }, Error>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  formatField: (field: F) => string;
  formatValue: (field: F, value: unknown) => string;
  /** Linha a mais por evento, para históricos que misturam objetos (cliente, rotina, ação). */
  describeEntry?: (entry: E) => string;
}

// Linha do tempo paginada lida da auditoria (Controle #1722, Relação #1723).
export function ContabilHistoryPanel<
  F extends string,
  E extends ContabilHistoryEntry<F> = ContabilHistoryEntry<F>,
>({
  titleId,
  title = "Histórico de alterações",
  subtitle,
  emptyMessage,
  query,
  page,
  pageSize,
  onPageChange,
  formatField,
  formatValue,
  describeEntry,
}: ContabilHistoryPanelProps<F, E>) {
  // Resposta fora do formato (sem `items`) vira histórico vazio: o painel é secundário e não
  // pode derrubar a tela que o hospeda.
  const history = Array.isArray(query.data?.items) ? query.data : undefined;
  const pageCount = getContabilHistoryPageCount(history?.total ?? 0, pageSize);

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-slate-400">{subtitle}</p>
      </div>

      {query.isLoading ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando histórico" compact>
          Buscando as alterações registradas.
        </ContabilStateBox>
      ) : null}

      {!query.isLoading && query.error ? (
        <ContabilStateBox
          icon={AlertCircle}
          tone="danger"
          title="Não foi possível carregar o histórico"
          compact
        >
          {getContabilErrorMessage(query.error)}
        </ContabilStateBox>
      ) : null}

      {!query.isLoading && !query.error && (!history || history.items.length === 0) ? (
        <p className="text-sm text-gray-600 dark:text-slate-400">{emptyMessage}</p>
      ) : null}

      {history && history.items.length > 0 ? (
        <ol className="divide-y divide-gray-100 dark:divide-slate-800">
          {history.items.map((entry) => (
            <li key={entry.id} className="space-y-1 py-3 text-sm">
              <p className="text-gray-900 dark:text-white">
                <span className="font-medium">{entry.actor?.name ?? "Usuário não identificado"}</span>
                <span className="text-gray-500 dark:text-slate-400">
                  {" · "}
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                </span>
              </p>
              {describeEntry ? (
                <p className="text-gray-600 dark:text-slate-400">{describeEntry(entry)}</p>
              ) : null}
              <ul className="space-y-0.5 text-gray-700 dark:text-slate-300">
                {entry.changes.map((change) => (
                  <li key={change.field}>
                    <span className="font-medium">{formatField(change.field)}</span>
                    {": "}
                    {formatValue(change.field, change.from)}
                    {" → "}
                    {formatValue(change.field, change.to)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}

      {history && history.total > pageSize ? (
        <nav aria-label="Paginação do histórico" className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || query.isFetching}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            Anterior
          </button>
          <span className="text-gray-600 dark:text-slate-400">
            Página {page} de {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount || query.isFetching}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            Próxima
          </button>
        </nav>
      ) : null}
    </section>
  );
}

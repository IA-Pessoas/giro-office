import { useState } from "react";
import { AlertCircle, History, Loader2 } from "lucide-react";

import { formatDateTime } from "@shared/utils/dateFormat";

import { useContabilControlHistory } from "../hooks";
import { getContabilErrorMessage } from "../services";
import type { ContabilCompetence } from "../types";
import { getContabilControlFieldLabel } from "./contabilControlFields";
import {
  CONTABIL_CONTROL_HISTORY_PAGE_SIZE,
  formatContabilControlHistoryValue,
  getContabilControlHistoryPageCount,
} from "./contabilControlHistory.helpers";
import { ContabilStateBox } from "./ContabilStateBox";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

interface ContabilControlHistoryProps {
  clientId: string;
  clientName?: string;
  competence: ContabilCompetence;
}

export function ContabilControlHistory({
  clientId,
  clientName,
  competence,
}: ContabilControlHistoryProps) {
  const [page, setPage] = useState(1);
  const historyQuery = useContabilControlHistory({
    clientId,
    competence,
    page,
    pageSize: CONTABIL_CONTROL_HISTORY_PAGE_SIZE,
  });

  const history = historyQuery.data;
  const pageCount = getContabilControlHistoryPageCount(
    history?.total ?? 0,
    CONTABIL_CONTROL_HISTORY_PAGE_SIZE,
  );

  return (
    <section
      aria-labelledby="contabil-control-history-title"
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          <h3
            id="contabil-control-history-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            Histórico de alterações
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          {clientName ? `${clientName} · ` : ""}Competência {competence}
        </p>
      </div>

      {historyQuery.isLoading ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando histórico" compact>
          Buscando as alterações desta competência.
        </ContabilStateBox>
      ) : null}

      {!historyQuery.isLoading && historyQuery.error ? (
        <ContabilStateBox
          icon={AlertCircle}
          tone="danger"
          title="Não foi possível carregar o histórico"
          compact
        >
          {getContabilErrorMessage(historyQuery.error)}
        </ContabilStateBox>
      ) : null}

      {history && history.items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Nenhuma alteração registrada nesta competência.
        </p>
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
              <ul className="space-y-0.5 text-gray-700 dark:text-slate-300">
                {entry.changes.map((change) => (
                  <li key={change.field}>
                    <span className="font-medium">{getContabilControlFieldLabel(change.field)}</span>
                    {": "}
                    {formatContabilControlHistoryValue(change.field, change.from)}
                    {" → "}
                    {formatContabilControlHistoryValue(change.field, change.to)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}

      {history && history.total > CONTABIL_CONTROL_HISTORY_PAGE_SIZE ? (
        <nav aria-label="Paginação do histórico" className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page <= 1 || historyQuery.isFetching}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            Anterior
          </button>
          <span className="text-gray-600 dark:text-slate-400">
            Página {page} de {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= pageCount || historyQuery.isFetching}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            Próxima
          </button>
        </nav>
      ) : null}
    </section>
  );
}

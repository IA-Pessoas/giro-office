import { useState } from "react";
import { History, Loader2 } from "lucide-react";

import { useAssignableUsers } from "@modules/rh";
import { formatDateTime } from "@shared/utils/dateFormat";

import { usePessoalObligationHistory } from "../hooks/usePessoalObligations";
import { PESSOAL_OBLIGATION_ITEMS } from "../types/obligations";
import { formatObligationHistoryValue } from "../utils/obligationPortfolio";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import { pessoalSecondaryButtonClassName } from "./pessoalFormControls";

const FIELD_LABELS = new Map<string, string>([
  ...PESSOAL_OBLIGATION_ITEMS.map((item) => [item.name, item.label] as const),
  ["responsavel_id", "Responsável"],
]);

interface PessoalObligationHistoryProps {
  obligationId: string;
}

/** Quem alterou cada item da obrigação, quando e de qual estado para qual. */
export function PessoalObligationHistory({ obligationId }: PessoalObligationHistoryProps) {
  const [page, setPage] = useState(1);
  const historyQuery = usePessoalObligationHistory(obligationId, page);
  const usersQuery = useAssignableUsers({ module: "pessoal" });
  const userNames = new Map((usersQuery.data ?? []).map((user) => [user.id, user.name]));
  const data = historyQuery.data;
  const hasMore = data ? page * data.pageSize < data.total : false;

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        Histórico
      </h4>

      {historyQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico...
        </p>
      ) : historyQuery.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {getPessoalErrorMessage(historyQuery.error, "Falha ao carregar o histórico.")}
        </p>
      ) : data && data.items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nenhuma alteração registrada nesta obrigação.
        </p>
      ) : data ? (
        <ul className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
          {data.items.map((entry) => (
            <li key={entry.id} className="py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(entry.at)} · {entry.actor?.name ?? "Usuário desconhecido"}
              </p>
              {entry.changes.map((change) => (
                <p key={change.field} className="text-gray-800 dark:text-gray-200">
                  <span className="font-medium">{FIELD_LABELS.get(change.field) ?? change.field}</span>
                  : {formatObligationHistoryValue(change.field, change.from, userNames)} →{" "}
                  {formatObligationHistoryValue(change.field, change.to, userNames)}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      {data && (page > 1 || hasMore) ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page <= 1 || historyQuery.isFetching}
            className={pessoalSecondaryButtonClassName}
          >
            Mais recentes
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasMore || historyQuery.isFetching}
            className={pessoalSecondaryButtonClassName}
          >
            Mais antigas
          </button>
        </div>
      ) : null}
    </div>
  );
}

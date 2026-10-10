import { useState } from "react";

import { useFetch } from "@shared/hooks";

import { triageStatementHistoryQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage, triageDocumentsService } from "../services";
import type { ContabilCompetence } from "../types";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";
import { STATUSES } from "./triageDocumentLabels";

const STATUS_LABELS = Object.fromEntries(STATUSES) as Record<string, string>;

/**
 * Marcadores bancários do cliente em todas as competências, agrupados por período, para achar
 * pendências antigas. Lê o mesmo acompanhamento dos extratos por banco.
 */
export function TriageStatementHistoryPanel({
  clientId,
  onOpenCompetence,
}: {
  clientId: string;
  onOpenCompetence: (competence: ContabilCompetence) => void;
}) {
  const [pendingOnly, setPendingOnly] = useState(true);
  const history = useFetch(triageStatementHistoryQueryKey(clientId, pendingOnly), () =>
    triageDocumentsService.getStatementHistory(clientId, { pending: pendingOnly }),
  );
  const competences = history.data?.competences ?? [];

  return (
    <section
      aria-labelledby="triage-statement-history-title"
      className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="triage-statement-history-title"
          className="font-semibold text-gray-900 dark:text-white"
        >
          Extratos bancários em todas as competências
        </h3>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(event) => setPendingOnly(event.target.checked)}
          />
          Só pendências
        </label>
      </div>
      {history.isLoading ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">Carregando extratos…</p>
      ) : null}
      {history.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {getContabilErrorMessage(history.error)}
        </p>
      ) : null}
      {history.data && competences.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
          {pendingOnly ? "Nenhuma pendência bancária." : "Nenhum extrato registrado."}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {competences.map((group) => (
          <li
            key={group.competence}
            className="rounded-lg border border-gray-100 p-3 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-gray-900 dark:text-white">
                Competência {group.competence}
                {group.pending ? ` · ${group.pending} pendente(s)` : ""}
              </strong>
              <button
                type="button"
                onClick={() => onOpenCompetence(group.competence)}
                className={CONTABIL_OUTLINE_ACTION_CLASS}
              >
                Abrir competência {group.competence}
              </button>
            </div>
            <ul className="mt-2 divide-y text-sm dark:divide-slate-800">
              {group.statements.map((statement) => (
                <li
                  key={statement.bank_id}
                  className="flex justify-between gap-2 py-1 text-gray-700 dark:text-slate-300"
                >
                  <span>{statement.bank_id}</span>
                  <span>{STATUS_LABELS[statement.status] ?? statement.status}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

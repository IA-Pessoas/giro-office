import { useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { useRhMyScores } from "../../hooks/useRhScore";
import {
  formatRhEvaluationCountLabel,
  formatRhQuarterLabel,
  formatRhScoreValue,
  getRhScoreDetailCategoryRows,
} from "../../utils/rhScoreUi";
import { RhScoreDetailDialog } from "./RhScoreDetailDialog";
import { getErrorMessage } from "./rhScoreShared";

export function RhScoreHistoryPanel({ canManageScore }: { canManageScore: boolean }) {
  const historyQuery = useRhMyScores();

  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const scoreHistory = historyQuery.data ?? [];
  const sortedScoreHistory = useMemo(
    () =>
      [...scoreHistory]
        .sort((left, right) => left.quarter.localeCompare(right.quarter)),
    [scoreHistory],
  );

  return (
    <>
      {historyQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-14 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico trimestral...
        </div>
      ) : historyQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(
            historyQuery.error,
            "Não foi possível carregar o histórico trimestral.",
          )}
        </div>
      ) : sortedScoreHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Eye className="h-5 w-5" />
          </div>

          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            {"Histórico indisponível"}
          </h3>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Seus trimestres aparecerão aqui assim que forem gerados.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            sortedScoreHistory.length >= 3 ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {sortedScoreHistory.map((score) => (
            <article
              key={score.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
                    {formatRhQuarterLabel(score.quarter)}
                  </p>

                  <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    Score final {formatRhScoreValue(score.final_score)}
                  </h3>

                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {score.evaluations?.length ?? 0}{" "}
                    {formatRhEvaluationCountLabel(score.evaluations?.length, "registered")}
                  </p>
                </div>

                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {score.nitro ? "Nitro vinculado" : "Sem Nitro"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {getRhScoreDetailCategoryRows(score).map((item) => (
                  <div key={item.key} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {item.label}
                    </p>

                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                      {formatRhScoreValue(item.value)}
                    </p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSelectedScoreId(score.id)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Eye className="h-4 w-4" />
                Ver detalhe do trimestre
              </button>
            </article>
          ))}
        </div>
      )}

      <RhScoreDetailDialog
        canManageScore={canManageScore}
        scoreId={selectedScoreId}
        onClose={() => setSelectedScoreId(null)}
      />
    </>
  );
}

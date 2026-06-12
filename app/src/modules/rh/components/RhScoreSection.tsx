import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eye, Loader2 } from "lucide-react";
import { useRhPermissions } from "../hooks/useRhPermissions";
import { useRhMyScores } from "../hooks/useRhScore";
import {
  formatRhEvaluationCountLabel,
  formatRhScoreValue,
  formatRhQuarterLabel,
  getRhScoreDetailCategoryRows,
} from "../utils/rhScoreUi";
import { RhScoreDetailDialog } from "./score/RhScoreDetailDialog";
import { RhScorePendingPanel } from "./score/RhScorePendingPanel";
import { RhScoreQuestionsPanel } from "./score/RhScoreQuestionsPanel";
import { SCORE_TAB_META, getErrorMessage, type RhScoreTab } from "./score/rhScoreShared";

function RhScoreHistoryTab({ canManageScore }: { canManageScore: boolean }) {
  const historyQuery = useRhMyScores();

  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const scoreHistory = historyQuery.data ?? [];
  const scoreHistory2026 = useMemo(
    () =>
      [...scoreHistory]
        .filter((score) => score.quarter?.startsWith("2026-Q"))
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
      ) : scoreHistory2026.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Eye className="h-5 w-5" />
          </div>

          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            {"Histórico indisponível"}
          </h3>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Seus trimestres de 2026 aparecerão aqui assim que forem gerados.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            scoreHistory2026.length >= 3 ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {scoreHistory2026.map((score) => (
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
export function RhScoreSection() {
  const { canManageRhScore, permissionQuery } = useRhPermissions("score");
  const canManageScore = canManageRhScore;
  const [activeTab, setActiveTab] = useState<RhScoreTab>(canManageScore ? "questions" : "pending");

  const hasInitializedAdminDefaultTab = useRef(false);

  useEffect(() => {
    if (!canManageScore && activeTab === "questions") {
      setActiveTab("pending");
    }
  }, [activeTab, canManageScore]);

  useEffect(() => {
    if (canManageScore || hasInitializedAdminDefaultTab.current) {
      return;
    }
    setActiveTab("pending");
  }, [canManageScore]);

  useEffect(() => {
    if (!canManageScore || hasInitializedAdminDefaultTab.current) {
      return;
    }
    setActiveTab("questions");
    hasInitializedAdminDefaultTab.current = true;
  }, [canManageScore]);

  const availableTabs = canManageScore
    ? (["questions", "pending", "history"] as RhScoreTab[])
    : (["pending", "history"] as RhScoreTab[]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {"Avaliações de score"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {"Perguntas, pendências e histórico trimestral."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {SCORE_TAB_META[tab].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {permissionQuery.error ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          {getErrorMessage(permissionQuery.error, "Não foi possível validar o acesso ao score agora.")}
        </div>
      ) : null}

      {activeTab === "questions" && canManageScore ? (
        <RhScoreQuestionsPanel canManageScore={canManageScore} />
      ) : null}

      {activeTab === "pending" ? <RhScorePendingPanel /> : null}

      {activeTab === "history" ? <RhScoreHistoryTab canManageScore={canManageScore} /> : null}

      {!canManageScore && activeTab === "questions" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Esse painel está disponível só para a gestão do RH.
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useRhPermissions } from "../../hooks/useRhPermissions";
import { RhScoreHistoryPanel } from "./RhScoreHistoryPanel";
import { RhScorePendingPanel } from "./RhScorePendingPanel";
import { RhScoreQuestionsPanel } from "./RhScoreQuestionsPanel";
import { SCORE_TAB_META, getErrorMessage, type RhScoreTab } from "./rhScoreShared";

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
          {getErrorMessage(
            permissionQuery.error,
            "Não foi possível validar o acesso ao score agora.",
          )}
        </div>
      ) : null}

      {activeTab === "questions" && canManageScore ? (
        <RhScoreQuestionsPanel canManageScore={canManageScore} />
      ) : null}

      {activeTab === "pending" ? <RhScorePendingPanel /> : null}

      {activeTab === "history" ? <RhScoreHistoryPanel canManageScore={canManageScore} /> : null}

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

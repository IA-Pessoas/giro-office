import { AlertCircle } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRhPermissions } from "../../hooks/useRhPermissions";
import { RhNitroHoursPanel } from "./RhNitroHoursPanel";
import { RhScoreHistoryPanel } from "./RhScoreHistoryPanel";
import { RhScorePendingPanel } from "./RhScorePendingPanel";
import { RhScoreQuestionsPanel } from "./RhScoreQuestionsPanel";
import { getErrorMessage, type RhScoreTab, SCORE_TAB_META } from "./rhScoreShared";
export function RhScoreSection() {
  const { canManageRhScore, permissionQuery } = useRhPermissions("score");
  const canManageScore = canManageRhScore;
  const [activeTab, setActiveTab] = useState<RhScoreTab>(canManageScore ? "questions" : "pending");
  const tabRefs = useRef<Partial<Record<RhScoreTab, HTMLButtonElement>>>({});
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
    ? (["questions", "pending", "history", "hours"] as RhScoreTab[])
    : (["pending", "history", "hours"] as RhScoreTab[]);
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: RhScoreTab) {
    const currentIndex = availableTabs.indexOf(tab);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % availableTabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + availableTabs.length) % availableTabs.length
          : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = availableTabs[nextIndex];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }
  return (
    <div className="space-y-6">
      <section
        className={`
          rounded-2xl border border-gray-200 bg-white p-5 shadow-sm
          dark:border-gray-700 dark:bg-gray-800
        `}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {"Avaliações de score"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {"Perguntas, pendências e histórico trimestral."}
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Seções de avaliações de score"
            className="flex flex-wrap gap-2 lg:justify-end"
          >
            {availableTabs.map((tab) => (
              <button
                key={tab}
                id={`rh-score-tab-${tab}`}
                ref={(element) => {
                  tabRefs.current[tab] = element ?? undefined;
                }}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="rh-score-panel"
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                className={`
                  rounded-lg px-4 py-2.5 text-sm font-medium transition-colors
                  ${
                    activeTab === tab
                      ? "bg-blue-600 text-white"
                      : `
                          border border-gray-200 bg-white text-gray-700 hover:bg-gray-100
                          dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700
                        `
                  }
                `}
              >
                {SCORE_TAB_META[tab].label}
              </button>
            ))}
          </div>
        </div>
      </section>
      {permissionQuery.error ? (
        <div
          className={`
            rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700
            dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300
          `}
        >
          {getErrorMessage(
            permissionQuery.error,
            "Não foi possível validar o acesso ao score agora.",
          )}
        </div>
      ) : null}
      <div id="rh-score-panel" role="tabpanel" aria-labelledby={`rh-score-tab-${activeTab}`}>
        {activeTab === "questions" && canManageScore ? (
          <RhScoreQuestionsPanel canManageScore={canManageScore} />
        ) : null}
        {activeTab === "pending" ? <RhScorePendingPanel /> : null}
        {activeTab === "history" ? <RhScoreHistoryPanel canManageScore={canManageScore} /> : null}
        {activeTab === "hours" ? <RhNitroHoursPanel canManageScore={canManageScore} /> : null}
        {!canManageScore && activeTab === "questions" ? (
          <div
            className={`
              rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700
              dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300
            `}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Esse painel está disponível só para a gestão do
              RH.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

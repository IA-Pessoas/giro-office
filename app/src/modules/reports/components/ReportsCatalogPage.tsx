import { useEffect, useState } from "react";
import { Archive, FileText, Layers3, ListChecks, Plus } from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccessMap } from "@modules/auth/hooks/useModuleAccess";
import { ReportsCreatePanel } from "./ReportsCreatePanel";
import { ReportHistoryPanel } from "./ReportHistoryPanel";
import { ReportModelsPanel } from "./ReportModelsPanel";

type ReportsTab = "create" | "models" | "history" | "library";

export function ReportsCatalogPage() {
  const [activeTab, setActiveTab] = useState<ReportsTab>("create");
  const { accessMap, departmentModule, user } = useModuleAccessMap();
  const [libraryAvailable, setLibraryAvailable] = useState(true);
  const canManageShared =
    user?.type === "admin" ||
    user?.type === "owner" ||
    Boolean(departmentModule && accessMap[departmentModule]?.isAdmin);
  const tabs: Array<{ id: ReportsTab; label: string; icon: typeof Plus }> = [
    { id: "create", label: "Criar", icon: Plus },
    { id: "models", label: "Modelos", icon: Layers3 },
    { id: "history", label: "Histórico pessoal", icon: ListChecks },
    { id: "library", label: "Acervo", icon: Archive },
  ];
  useEffect(() => {
    if (!departmentModule && activeTab === "library") setActiveTab("create");
  }, [activeTab, departmentModule]);

  function handleLibraryAccessDenied() {
    setLibraryAvailable(false);
    setActiveTab("create");
    toast.info("O Acervo não está disponível para este usuário.");
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          Relatórios
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Escolha informações, revise seu relatório e consulte modelos e resultados.
        </p>
      </header>

      <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas de relatórios">
          <div role="tablist" className="flex min-w-max items-center gap-1">
            {tabs
              .filter(
                (tab) => tab.id !== "library" || (libraryAvailable && Boolean(departmentModule)),
              )
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  id={`reports-tab-${id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === id}
                  aria-controls={`reports-${id}-panel`}
                  tabIndex={activeTab === id ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === id ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
          </div>
        </nav>
      </section>

      {activeTab === "create" ? (
        <section
          id="reports-create-panel"
          role="tabpanel"
          aria-labelledby="reports-tab-create"
          className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-slate-700 dark:bg-slate-900"
        >
          <ReportsCreatePanel />
        </section>
      ) : null}
      {activeTab === "models" ? <ReportModelsPanel canManageShared={canManageShared} /> : null}
      {activeTab === "history" ? <ReportHistoryPanel scope="personal" /> : null}
      {activeTab === "library" ? (
        <ReportHistoryPanel scope="library" onAccessDenied={handleLibraryAccessDenied} />
      ) : null}
    </div>
  );
}
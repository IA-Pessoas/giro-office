import { BookOpen, Loader2 } from "lucide-react";

import { useReportsCatalog } from "../hooks/useReportsCatalog";
import { panelClassName } from "./reportUi";

export function ReportsCreatePanel() {
  const catalogQuery = useReportsCatalog();
  const catalogItems = catalogQuery.data?.items ?? [];

  return (
    <section className={panelClassName} aria-labelledby="reports-create-title">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="reports-create-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Criar relatório
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Escolha uma fonte autorizada para iniciar um modelo ou executar um relatório.
          </p>
        </div>
        <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
      </div>

      {catalogQuery.isPending ? (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Carregando fontes de relatório...
        </div>
      ) : catalogQuery.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {catalogQuery.error.message}
        </p>
      ) : catalogItems.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-slate-400" role="status">
          Nenhuma fonte de relatório está disponível no seu perfil.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalogItems.map((source) => (
            <li key={source.key} className="rounded-lg border border-gray-200 p-4 dark:border-slate-700">
              <p className="font-medium text-gray-900 dark:text-white">{source.label}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{source.module}</p>
              <p className="mt-3 text-xs text-gray-500 dark:text-slate-500">
                {source.fields.length} campos autorizados
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

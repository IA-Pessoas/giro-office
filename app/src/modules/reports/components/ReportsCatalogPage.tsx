import { BookOpen, FileText, Loader2 } from "lucide-react";

import { useReportsCatalog } from "../hooks/useReportsCatalog";

export function ReportsCatalogPage() {
  const catalogQuery = useReportsCatalog();
  const catalogItems = catalogQuery.data?.items ?? [];

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
          Consulte fontes autorizadas para montar relatórios.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas de relatórios">
          <div role="tablist" className="flex min-w-max items-center gap-1">
            <button
              aria-controls="reports-catalog-panel"
              aria-selected="true"
              className="inline-flex items-center rounded-lg bg-blue-100 px-5 py-2.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              id="reports-tab-catalog"
              role="tab"
              tabIndex={0}
              type="button"
            >
              Catálogo
            </button>
          </div>
        </nav>
      </section>

      <section
        aria-labelledby="reports-tab-catalog"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
        id="reports-catalog-panel"
        role="tabpanel"
      >
        {catalogQuery.isPending ? (
          <div
            aria-live="polite"
            className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400"
            role="status"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Carregando fontes de relatório...
          </div>
        ) : catalogQuery.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {catalogQuery.error.message}
          </p>
        ) : catalogItems.length === 0 ? (
          <div
            className="flex max-w-2xl items-start gap-3 text-sm text-gray-600 dark:text-slate-400"
            role="status"
          >
            <BookOpen
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300"
            />
            <p>
              Nenhuma fonte de relatório está disponível no seu perfil. As fontes aparecem aqui quando
              você tem acesso a dados reportáveis.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogItems.map((source) => (
              <li
                key={source.key}
                className="rounded-lg border border-gray-200 p-4 dark:border-slate-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">{source.label}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{source.module}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

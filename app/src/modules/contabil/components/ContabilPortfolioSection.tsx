import { useState } from "react";
import { AlertCircle, CalendarDays, RotateCcw } from "lucide-react";

import { useContabilControlPortfolio } from "../hooks";
import { getContabilErrorMessage } from "../services";
import type { ContabilCompetence, ContabilControl } from "../types";
import { CONTABIL_CONTROL_CHECKLIST_FIELDS } from "./contabilControlFields";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilStateBox } from "./ContabilStateBox";

function completedItems(control: ContabilControl): number {
  return CONTABIL_CONTROL_CHECKLIST_FIELDS.filter((field) => control[field.field]).length;
}

export function ContabilPortfolioSection() {
  const [competence, setCompetence] = useState<ContabilCompetence>(getCurrentContabilCompetence());
  const portfolioQuery = useContabilControlPortfolio(competence);
  const items = portfolioQuery.data?.items ?? [];
  const controlsStarted = items.filter((item) => item.control !== null).length;
  const missingControls = items.length - controlsStarted;

  return (
    <section className="space-y-4" aria-labelledby="contabil-portfolio-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="contabil-portfolio-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Carteira operacional
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Acompanhe todos os clientes Contábil da competência sem abrir cada ficha.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          Competência
          <input
            aria-label="Competência da carteira"
            type="month"
            value={competence}
            onChange={(event) => setCompetence(event.target.value as ContabilCompetence)}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </label>
      </div>

      {portfolioQuery.isLoading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="h-11 animate-pulse bg-gray-100 dark:bg-slate-800" />
          <div className="space-y-3 p-4">
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
          </div>
        </div>
      ) : null}

      {portfolioQuery.isError ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a carteira">
          <span>{getContabilErrorMessage(portfolioQuery.error)}</span>
          <button
            type="button"
            onClick={() => void portfolioQuery.refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:hover:bg-red-900/30"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Tentar novamente
          </button>
        </ContabilStateBox>
      ) : null}

      {!portfolioQuery.isLoading && !portfolioQuery.isError && items.length === 0 ? (
        <ContabilStateBox icon={CalendarDays} title="Nenhum cliente elegível nesta competência">
          Não há clientes Contábil elegíveis no intervalo desta competência.
        </ContabilStateBox>
      ) : null}

      {!portfolioQuery.isLoading && !portfolioQuery.isError && items.length > 0 ? (
        <>
          <p aria-live="polite" className="text-sm text-gray-600 dark:text-slate-400">
            {items.length} clientes, {controlsStarted} controles iniciados e {missingControls} sem controle mensal.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Controle mensal</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Itens concluídos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {items.map((item) => {
                  const complete = item.control ? completedItems(item.control) : null;
                  return (
                    <tr key={item.client_id}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.legal_name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                        {item.control ? "Iniciado" : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-slate-300">
                        {complete === null ? "—" : `${complete}/${CONTABIL_CONTROL_CHECKLIST_FIELDS.length}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

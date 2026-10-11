import { useFetch } from "@shared/hooks";
import { AlertCircle, CalendarRange, Loader2 } from "lucide-react";
import { Fragment, useState } from "react";

import { fiscalAnnualControlsQueryKey } from "../hooks/queryKeys";
import {
  annualItemSource,
  FISCAL_ANNUAL_DECLARATIONS,
  fiscalAnnualService,
} from "../services/fiscalAnnualService";
import { formatAnnualDeclaration, getFiscalErrorMessage } from "../utils";
import { FISCAL_FIELD_CONTROL_CLASSNAME } from "./fiscalFieldStyles";
import { FiscalControlObligationsPanel } from "./FiscalControlObligationsPanel";
import { FiscalStateBox } from "./FiscalStateBox";

function isYear(value: string): boolean {
  return /^\d{4}$/.test(value) && Number(value) >= 2000 && Number(value) <= 2100;
}

/** Declarações anuais por cliente e ano-calendário; o andamento é por declaração. */
export function FiscalAnnualControlsSection({ canEdit }: { canEdit: boolean }) {
  // Padrão: ano-calendário anterior, cujas declarações vencem no ano corrente.
  const [year, setYear] = useState(() => String(new Date().getFullYear() - 1));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const validYear = isYear(year);
  const list = useFetch(
    fiscalAnnualControlsQueryKey(Number(year)),
    () => fiscalAnnualService.list(Number(year)),
    { enabled: validYear },
  );
  const items = list.data?.items ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Controle anual</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Um controle por cliente com Fiscal ativo no ano-calendário, com DEFIS, DMED, DIMOB e DASN-SIMEI quando aplicáveis. Sem situação geral: acompanhe cada declaração.
        </p>
      </div>

      <label className="grid w-40 gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        Ano-calendário
        <input type="number" min={2000} max={2100} required value={year} onChange={(event) => setYear(event.target.value)} aria-invalid={validYear ? undefined : true} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
      </label>

      {list.isLoading ? (
        <div role="status">
          <FiscalStateBox icon={Loader2} tone="loading" title="Carregando controles anuais" compact>
            Estamos gerando e consultando os controles do ano.
          </FiscalStateBox>
        </div>
      ) : null}
      {list.error ? (
        <div role="alert">
          <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar os controles anuais" compact>
            {getFiscalErrorMessage(list.error)}
          </FiscalStateBox>
        </div>
      ) : null}
      {list.data && items.length === 0 ? (
        <FiscalStateBox icon={CalendarRange} title="Nenhum controle neste ano" compact>
          Nenhum cliente com Fiscal ativo no ano, ou o ano ainda não começou.
        </FiscalStateBox>
      ) : null}
      {items.length ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Controles fiscais anuais de {year}</caption>
            <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Responsável</th>
                {FISCAL_ANNUAL_DECLARATIONS.map(([code, label]) => <th key={code} className="px-4 py-3">{label}</th>)}
                <th className="px-4 py-3"><span className="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item) => {
                const expanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className="text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-3">{item.client_name}</td>
                      <td className="px-4 py-3">{item.regime ?? "—"}</td>
                      <td className="px-4 py-3">{item.responsible_name ?? "Sem responsável"}</td>
                      {FISCAL_ANNUAL_DECLARATIONS.map(([code]) => (
                        <td key={code} className="px-4 py-3">
                          {formatAnnualDeclaration(item.declarations.find((entry) => entry.code === code))}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} aria-expanded={expanded} aria-controls={`fiscal-annual-${item.id}`} className="text-blue-700 hover:underline dark:text-blue-300">
                          {expanded ? "Fechar" : "Declarações"}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr id={`fiscal-annual-${item.id}`}>
                        <td colSpan={4 + FISCAL_ANNUAL_DECLARATIONS.length} className="bg-gray-50 px-4 py-3 dark:bg-slate-800/50">
                          <FiscalControlObligationsPanel source={annualItemSource(item.id)} clientName={item.client_name} canEdit={canEdit} locked={false} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

import { useFetch } from "@shared/hooks";
import { useState } from "react";

import { fiscalSimplesPreviewQueryKey } from "../hooks/queryKeys";
import { fiscalRevenueService } from "../services/fiscalRevenueService";
import {
  competenceFromToday,
  formatCompetenceLabel,
  formatRatePercent,
  formatRevenueAmount,
  getFiscalErrorMessage,
} from "../utils";
import { FISCAL_FIELD_CONTROL_CLASSNAME } from "./fiscalFieldStyles";

export function FiscalSimplesPreviewSection({ clientId }: { clientId: string }) {
  const [competence, setCompetence] = useState(() => competenceFromToday());
  const preview = useFetch(
    [...fiscalSimplesPreviewQueryKey(clientId, competence)],
    () => fiscalRevenueService.simplesPreview(clientId, competence),
    { enabled: /^\d{4}-\d{2}$/.test(competence) },
  );
  const data = preview.data;

  return (
    <div className="space-y-4 border-t border-gray-200 pt-6 dark:border-slate-700">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prévia de alíquotas</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          RBT12 = receitas dos 11 meses anteriores + a média deles como 12º mês. Valores sem os limites aplicados na emissão.
        </p>
      </div>
      <label className="grid max-w-xs gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        Competência da alíquota
        <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
      </label>

      {preview.isLoading ? <p role="status" className="text-sm text-gray-600">Calculando prévia...</p> : null}
      {preview.error ? <p role="alert" className="text-sm text-red-600">{getFiscalErrorMessage(preview.error)}</p> : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Base de receita considerada no RBT12</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300"><tr><th className="px-4 py-2">Competência</th><th className="px-4 py-2 text-right">Receita</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                <tr className="text-gray-800 dark:text-gray-200">
                  <td className="px-4 py-2">{formatCompetenceLabel(data.estimated_month.competence)} <span className="text-xs text-gray-500">(média estimada)</span></td>
                  <td className="px-4 py-2 text-right">{formatRevenueAmount(data.estimated_month.amount)}</td>
                </tr>
                {data.months.map((month) => (
                  <tr key={month.competence} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">{formatCompetenceLabel(month.competence)} {month.registered ? null : <span className="text-xs text-amber-700 dark:text-amber-300">(sem registro)</span>}</td>
                    <td className="px-4 py-2 text-right">{formatRevenueAmount(month.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-900 dark:bg-slate-800 dark:text-white">
                <tr><td className="px-4 py-2">RBT12</td><td className="px-4 py-2 text-right">{formatRevenueAmount(data.rbt12)}</td></tr>
              </tfoot>
            </table>
          </div>

          {data.status === "ok" ? (
            <ul className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.annexes.map((item) => (
                <li key={item.annex} className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Anexo {item.annex} · {item.tax}</p>
                  <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">{formatRatePercent(item.rate)}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-2 text-xs text-gray-600 dark:text-gray-400">
                    <dt>Faixa</dt><dd className="text-right">{item.bracket}ª</dd>
                    <dt>Alíquota nominal</dt><dd className="text-right">{formatRatePercent(item.nominal_rate)}</dd>
                    <dt>Parcela a deduzir</dt><dd className="text-right">{formatRevenueAmount(item.deduction)}</dd>
                    <dt>Alíquota efetiva</dt><dd className="text-right">{formatRatePercent(item.effective_rate)}</dd>
                    <dt>Repartição {item.tax}</dt><dd className="text-right">{formatRatePercent(item.tax_share)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="self-start rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
              {data.message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

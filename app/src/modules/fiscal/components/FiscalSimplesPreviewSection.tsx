import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { fiscalSimplesPreviewQueryKey } from "../hooks/queryKeys";
import { type FiscalSimplesAnnexRate, fiscalRevenueService } from "../services/fiscalRevenueService";
import {
  competenceFromToday,
  downloadFile,
  formatCompetenceLabel,
  formatRatePercent,
  formatRevenueAmount,
  getFiscalErrorMessage,
} from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  INVALID_COMPETENCE_MESSAGE,
  isCompetence,
} from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

export function FiscalSimplesPreviewSection({ clientId }: { clientId: string }) {
  // Apuração do mês anterior: a alíquota emitida vale para o mês atual.
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [emitting, setEmitting] = useState<string | null>(null);
  const preview = useFetch(
    [...fiscalSimplesPreviewQueryKey(clientId, competence)],
    () => fiscalRevenueService.simplesPreview(clientId, competence),
    { enabled: isCompetence(competence) },
  );
  const data = isCompetence(competence) ? preview.data : undefined;
  const missingMonths = data?.months.filter((month) => !month.registered).length ?? 0;

  async function emitPdf(item: FiscalSimplesAnnexRate) {
    setEmitting(item.annex);
    try {
      const { blob, fileName } = await fiscalRevenueService.downloadSimplesPdf(
        clientId,
        competence,
        item.annex,
      );
      downloadFile(blob, fileName);
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    } finally {
      setEmitting(null);
    }
  }

  return (
    <div className="space-y-4 border-t border-gray-200 pt-6 dark:border-slate-700">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prévia de alíquotas</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          RBT12 = receitas dos 11 meses anteriores à apuração + a média deles como 12º mês. Os percentuais da prévia são brutos; a emissão aplica ICMS de 1,36% a 5% e ISS de 2,01% a 5%.
        </p>
      </div>
      <label className="grid max-w-xs gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        Competência de apuração
        <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} aria-invalid={isCompetence(competence) ? undefined : true} aria-describedby="fiscal-simples-applies-to" className={FISCAL_FIELD_CONTROL_CLASSNAME} />
        {isCompetence(competence) ? (
          data ? <span id="fiscal-simples-applies-to" className="text-xs font-normal text-gray-600 dark:text-gray-400">Alíquota emitida para {formatCompetenceLabel(data.applies_to)}</span> : null
        ) : (
          <span id="fiscal-simples-applies-to" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{INVALID_COMPETENCE_MESSAGE}</span>
        )}
      </label>

      {preview.isLoading ? (
        <div role="status">
          <FiscalStateBox icon={Loader2} tone="loading" title="Calculando prévia" compact>
            Estamos somando as receitas dos 11 meses anteriores.
          </FiscalStateBox>
        </div>
      ) : null}
      {preview.error ? (
        <div role="alert">
          <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível calcular a prévia" compact>
            {getFiscalErrorMessage(preview.error)}
          </FiscalStateBox>
        </div>
      ) : null}
      {data?.status === "ok" && missingMonths > 0 ? (
        <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          {missingMonths === 1 ? "1 mês sem receita registrada entra" : `${missingMonths} meses sem receita registrada entram`} como zero no RBT12 e podem baixar a alíquota. Confira as receitas antes de emitir.
        </p>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Base de receita considerada no RBT12</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300"><tr><th className="px-4 py-2">Competência</th><th className="px-4 py-2 text-right">Receita</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                <tr className="text-gray-800 dark:text-gray-200">
                  <td className="px-4 py-2">{formatCompetenceLabel(data.estimated_month.competence)} <span className="text-xs text-gray-500 dark:text-gray-400">(média estimada)</span></td>
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
            <ul className="grid content-start gap-3 sm:grid-cols-2">
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
                  {item.emission_rate ? (
                    <button type="button" onClick={() => void emitPdf(item)} disabled={emitting !== null} aria-label={`Emitir PDF do Anexo ${item.annex} (${item.tax})`} className={`${FISCAL_SECONDARY_BUTTON_CLASSNAME} mt-3 w-full`}>
                      {emitting === item.annex ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Emitir PDF · {formatRatePercent(item.emission_rate)}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Sem alíquota para emitir: na 6ª faixa o {item.tax} é recolhido fora do Simples.</p>
                  )}
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

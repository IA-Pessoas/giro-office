import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { type FiscalInvoicePdfTotals, fiscalConferenceService } from "../services/fiscalConferenceService";
import { downloadFile, formatMoney, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmos tetos do serviço: até 50 PDFs e ~650 kB somados (base64 dentro do 1 MB do gateway).
const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 650_000;

export function FiscalInvoicePdfSection({ canEdit }: { canEdit: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<FiscalInvoicePdfTotals | null>(null);
  const sum = useMutation({ mutationFn: fiscalConferenceService.sumInvoicePdfs });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) return;
    if (files.length > MAX_FILES || files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      toast.error("Envie até 50 PDFs com no máximo 650 kB somados; divida em lotes menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await sum.mutateAsync(files));
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section aria-labelledby="fiscal-invoice-pdf-title" className="space-y-4">
      <div>
        <h2 id="fiscal-invoice-pdf-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Totais de faturas em PDF
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie os PDFs das faturas, um total por PDF. Cada PDF precisa ter camada de texto (gerado por sistema, não escaneado) e sem senha. O total é procurado por rótulos como Total a pagar e Valor total; fatura com mais de um total diferente, PDF ilegível ou repetido fica fora da soma e aparece abaixo. Nada é gravado.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com faturas reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_auto] md:items-end dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            PDFs das faturas
            <input type="file" accept=".pdf,application/pdf" multiple required onChange={(event) => { setFiles([...(event.target.files ?? [])]); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <button type="submit" disabled={files.length === 0 || sum.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {sum.isPending ? "Somando..." : `Somar ${files.length || ""} PDF(s)`}
          </button>
        </form>
      ) : (
        <p role="note" className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-gray-400">
          Executar conferências exige permissão de edição no Fiscal.
        </p>
      )}

      {result ? (
        <div className="space-y-3">
          {result.status === "partial" ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Total parcial: {result.ambiguous.length} fatura(s) ambígua(s) e {result.not_processed.length} arquivo(s) não processado(s) ficaram fora da soma.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todas as faturas foram lidas e somadas.
            </p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-400">Formato suportado: {result.supported_format}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatMoney(result.totals.value)} <span className="text-sm font-normal text-gray-600 dark:text-gray-400">em {result.totals.invoices} fatura(s)</span>
            </p>
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Faturas somadas, ambíguas e não processadas</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Arquivo</th>
                  <th className="px-4 py-2">Página</th>
                  <th className="px-4 py-2">Rótulo</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Linha do PDF</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {result.invoices.map((invoice) => (
                  <tr key={`ok-${invoice.file_name}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">Somada</td>
                    <td className="px-4 py-2">{invoice.file_name}</td>
                    <td className="px-4 py-2">{invoice.origin.page}</td>
                    <td className="px-4 py-2">{invoice.origin.label}</td>
                    <td className="px-4 py-2">{formatMoney(invoice.value)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{invoice.origin.line}</td>
                    <td className="px-4 py-2">{invoice.occurrences > 1 ? `Mesmo valor em ${invoice.occurrences} pontos, somado uma vez` : ""}</td>
                  </tr>
                ))}
                {result.ambiguous.flatMap((item) =>
                  item.candidates.map((candidate, index) => (
                    <tr key={`amb-${item.file_name}-${index}`} className="text-amber-800 dark:text-amber-300">
                      <td className="px-4 py-2">Ambígua</td>
                      <td className="px-4 py-2">{item.file_name}</td>
                      <td className="px-4 py-2">{candidate.page}</td>
                      <td className="px-4 py-2">{candidate.label}</td>
                      <td className="px-4 py-2">{formatMoney(candidate.value)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{candidate.line}</td>
                      <td className="px-4 py-2">{item.reason}</td>
                    </tr>
                  )),
                )}
                {result.not_processed.map((item) => (
                  <tr key={`np-${item.file_name}`} className="text-gray-700 dark:text-gray-300">
                    <td className="px-4 py-2">Não processada</td>
                    <td className="px-4 py-2">{item.file_name}</td>
                    <td className="px-4 py-2" colSpan={4}>—</td>
                    <td className="px-4 py-2">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { type FiscalXmlTaxTotals, fiscalConferenceService } from "../services/fiscalConferenceService";
import { downloadFile, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmo teto do serviço: ~650 kB de ZIP em base64 dentro do 1 MB do gateway.
const MAX_ZIP_BYTES = 650_000;

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: string | null) => (value ? currency.format(Number(value)) : "—");

export function FiscalXmlTaxesSection({ canEdit }: { canEdit: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<FiscalXmlTaxTotals | null>(null);
  const sum = useMutation({ mutationFn: fiscalConferenceService.sumXmlTaxes });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (file.size > MAX_ZIP_BYTES) {
      toast.error("O ZIP excede 650 kB; divida as notas em arquivos menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await sum.mutateAsync(file));
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section aria-labelledby="fiscal-xml-taxes-title" className="space-y-4">
      <div>
        <h2 id="fiscal-xml-taxes-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          IPI e ICMS ST de XML
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie um ZIP com XML de NF-e. O total soma o vIPI e o vICMSST de cada item, nota por nota; XML inválido, repetido com conteúdo diferente ou não autorizado fica fora da soma e aparece abaixo. Não é apuração de imposto. Nada é gravado.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com XMLs reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_auto] md:items-end dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            XML de NF-e (ZIP)
            <input type="file" accept=".zip,application/zip" required onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <button type="submit" disabled={!file || sum.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {sum.isPending ? "Somando..." : "Somar"}
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
              Total parcial: {result.errors.length} XML com erro e {result.excluded.length} nota(s) excluída(s) ficaram fora da soma{result.sources.xml.nfe_entries === 0 ? "; o ZIP não tem NF-e" : ""}.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todos os XML de NF-e foram lidos e somados.
            </p>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700"><dt className="text-gray-600 dark:text-gray-400">IPI</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{money(result.totals.ipi)}</dd></div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700"><dt className="text-gray-600 dark:text-gray-400">ICMS ST</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{money(result.totals.icms_st)}</dd></div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700"><dt className="text-gray-600 dark:text-gray-400">Composição</dt><dd className="text-gray-900 dark:text-white">{result.totals.notes} nota(s), {result.totals.items} item(ns) de {result.sources.xml.entries} arquivo(s)</dd></div>
          </dl>
          <div className="flex justify-end">
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Composição dos totais de IPI e ICMS ST</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Nota / item</th>
                  <th className="px-4 py-2">Arquivo</th>
                  <th className="px-4 py-2">IPI</th>
                  <th className="px-4 py-2">ICMS ST</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {result.notes.flatMap((note) => [
                  <tr key={note.identity} className="font-medium text-gray-900 dark:text-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{note.identity}</td>
                    <td className="px-4 py-2">{note.entry}</td>
                    <td className="px-4 py-2">{money(note.ipi)}</td>
                    <td className="px-4 py-2">{money(note.icms_st)}</td>
                    <td className="px-4 py-2">{note.differences.join(" | ")}</td>
                  </tr>,
                  ...note.items.map((item) => (
                    <tr key={`${note.identity}-${item.number}`} className="text-gray-700 dark:text-gray-300">
                      <td className="py-2 pl-8 pr-4">Item {item.number} · {item.description || item.code}</td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2">{money(item.ipi)}</td>
                      <td className="px-4 py-2">{money(item.icms_st)}</td>
                      <td className="px-4 py-2" />
                    </tr>
                  )),
                ])}
                {result.excluded.map((item) => (
                  <tr key={`excluded-${item.identity}`} className="text-amber-800 dark:text-amber-300">
                    <td className="px-4 py-2 font-mono text-xs">{item.identity}</td>
                    <td className="px-4 py-2">{item.entries.join(", ")}</td>
                    <td className="px-4 py-2" colSpan={2}>Fora da soma</td>
                    <td className="px-4 py-2">{item.reason}</td>
                  </tr>
                ))}
                {[...result.errors.map((item) => ({ entry: item.entry, note: item.message, kind: "Erro" })), ...result.discarded.map((item) => ({ entry: item.entry, note: item.reason, kind: "Descartado" }))].map((item) => (
                  <tr key={`${item.kind}-${item.entry}`} className="text-gray-700 dark:text-gray-300">
                    <td className="px-4 py-2">{item.kind}</td>
                    <td className="px-4 py-2">{item.entry}</td>
                    <td className="px-4 py-2" colSpan={2}>Fora da soma</td>
                    <td className="px-4 py-2">{item.note}</td>
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

import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  type FiscalSimplesAnnexRate,
  type FiscalSimplesBatch,
  fiscalRevenueService,
} from "../services/fiscalRevenueService";
import {
  competenceFromToday,
  formatCompetenceLabel,
  getFiscalErrorMessage,
  nextCompetence,
  parseBatchDocuments,
} from "../utils";
import { FISCAL_FIELD_CONTROL_CLASSNAME } from "./fiscalFieldStyles";

const ANNEX_OPTIONS: Array<{ value: FiscalSimplesAnnexRate["annex"]; label: string }> = [
  { value: "I", label: "Anexo I · ICMS" },
  { value: "II", label: "Anexo II · ICMS" },
  { value: "III", label: "Anexo III · ISS" },
  { value: "IV", label: "Anexo IV · ISS" },
  { value: "V", label: "Anexo V · ISS" },
];

function download(content: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FiscalSimplesBatchSection() {
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [annex, setAnnex] = useState<FiscalSimplesAnnexRate["annex"]>("III");
  const [documentsText, setDocumentsText] = useState("");
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalSimplesBatch | null>(null);
  const exportCsv = useMutation({ mutationFn: fiscalRevenueService.exportSimplesCsv });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documents = parseBatchDocuments(documentsText);
    if (documents.length === 0) {
      setDocumentsError("Informe ao menos um CPF/CNPJ, um por linha.");
      return;
    }
    setDocumentsError(null);
    try {
      const batch = await exportCsv.mutateAsync({ competence, annex, documents });
      setResult(batch);
      if (batch.included.length > 0) {
        download(batch.csv, batch.file_name);
        toast.success(`CSV exportado com ${batch.included.length} cliente(s).`);
      } else {
        toast.error("Nenhum cliente do lote tem alíquota para emitir; nenhum arquivo gerado.");
      }
    } catch (error) {
      setResult(null);
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section className="mt-8 space-y-4 border-t border-gray-200 pt-6 dark:border-slate-700">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Emissão em lote</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Entram os clientes com Fiscal habilitado, ativos no mês da alíquota e no Simples Nacional. Os demais aparecem abaixo com o motivo.
        </p>
      </div>
      <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_2fr] dark:border-slate-700">
        <label className="grid content-start gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Competência de apuração
          <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
            Alíquota para {/^\d{4}-\d{2}$/.test(competence) ? formatCompetenceLabel(nextCompetence(competence)) : "—"}
          </span>
        </label>
        <label className="grid content-start gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Anexo
          <select value={annex} onChange={(event) => setAnnex(event.target.value as FiscalSimplesAnnexRate["annex"])} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            {ANNEX_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          CPF/CNPJ dos clientes (um por linha)
          <textarea
            rows={5}
            value={documentsText}
            onChange={(event) => setDocumentsText(event.target.value)}
            aria-invalid={documentsError ? true : undefined}
            aria-describedby={documentsError ? "fiscal-simples-batch-documents-error" : undefined}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          {documentsError ? <span id="fiscal-simples-batch-documents-error" role="alert" className="text-xs font-normal text-red-600">{documentsError}</span> : null}
        </label>
        <div className="md:col-span-3">
          <button type="submit" disabled={exportCsv.isPending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {exportCsv.isPending ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
      </form>

      {result ? (
        <div className="space-y-3" role="status">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {result.included.length} cliente(s) no CSV · {result.skipped.length} ignorado(s)
          </p>
          {result.skipped.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Clientes ignorados no lote</caption>
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300"><tr><th className="px-4 py-2">CPF/CNPJ</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Motivo</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {result.skipped.map((item, index) => (
                    <tr key={`${item.document}-${index}`} className="text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-2 font-mono">{item.document}</td>
                      <td className="px-4 py-2">{item.client_name ?? "—"}</td>
                      <td className="px-4 py-2">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

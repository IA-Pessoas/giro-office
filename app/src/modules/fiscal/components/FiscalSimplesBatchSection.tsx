import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  type FiscalSimplesAnnexRate,
  type FiscalSimplesBatchPayload,
  type FiscalSimplesExport,
  type FiscalSimplesBatchResult,
  fiscalRevenueService,
} from "../services/fiscalRevenueService";
import {
  competenceFromToday,
  downloadFile,
  formatCompetenceLabel,
  getFiscalErrorMessage,
  nextCompetence,
  parseBatchDocuments,
} from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
  INVALID_COMPETENCE_MESSAGE,
  isCompetence,
} from "./fiscalFieldStyles";

const ANNEX_OPTIONS: Array<{ value: FiscalSimplesAnnexRate["annex"]; label: string }> = [
  { value: "I", label: "Anexo I · ICMS" },
  { value: "II", label: "Anexo II · ICMS" },
  { value: "III", label: "Anexo III · ISS" },
  { value: "IV", label: "Anexo IV · ISS" },
  { value: "V", label: "Anexo V · ISS" },
];

type ExportKind = "csv" | "zip";

const EXPORTS: Record<
  ExportKind,
  {
    run: (payload: FiscalSimplesBatchPayload) => Promise<FiscalSimplesExport>;
    label: string;
    pending: string;
    done: string;
  }
> = {
  csv: {
    run: fiscalRevenueService.exportSimplesCsv,
    label: "Exportar CSV",
    pending: "Exportando...",
    done: "CSV exportado",
  },
  zip: {
    run: fiscalRevenueService.exportSimplesZip,
    label: "Exportar PDFs (ZIP)",
    pending: "Gerando PDFs...",
    done: "ZIP com os PDFs exportado",
  },
};

export function FiscalSimplesBatchSection() {
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [annex, setAnnex] = useState<FiscalSimplesAnnexRate["annex"]>("III");
  const [documentsText, setDocumentsText] = useState("");
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalSimplesBatchResult | null>(null);
  const exportBatch = useMutation({
    mutationFn: ({ kind, payload }: { kind: ExportKind; payload: FiscalSimplesBatchPayload }) =>
      EXPORTS[kind].run(payload),
  });

  async function submitExport(kind: ExportKind) {
    if (!isCompetence(competence)) return;
    const documents = parseBatchDocuments(documentsText);
    if (documents.length === 0) {
      setDocumentsError("Informe ao menos um CPF/CNPJ, um por linha.");
      return;
    }
    setDocumentsError(null);
    try {
      const { batch, file } = await exportBatch.mutateAsync({
        kind,
        payload: { competence, annex, documents },
      });
      setResult(batch);
      if (file) {
        downloadFile(file, batch.file_name);
        toast.success(`${EXPORTS[kind].done} com ${batch.included.length} cliente(s).`);
      } else {
        toast.error("Nenhum cliente do lote tem alíquota para emitir; nenhum arquivo gerado.");
      }
    } catch (error) {
      setResult(null);
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    // Operação da organização inteira: recolhível no topo da aba, fora do fluxo de um cliente.
    <details className="group mb-6 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
      <summary className="cursor-pointer list-none">
        <h2 className="inline text-lg font-semibold text-gray-900 dark:text-white">Emissão em lote</h2>
        <span className="ml-2 text-sm text-blue-700 group-open:hidden dark:text-blue-300">Abrir</span>
        <span className="block text-sm text-gray-600 dark:text-gray-400">
          CSV ou PDFs (ZIP) para uma lista de CPF/CNPJ. Entram os clientes com Fiscal habilitado, ativos no mês da alíquota e no Simples Nacional; os demais aparecem com o motivo.
        </span>
      </summary>
      <div className="mt-4 space-y-4">
      <form noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submitExport("csv");
      }} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_2fr] dark:border-slate-700">
        <label className="grid content-start gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Competência de apuração
          <input type="month" required value={competence} onChange={(event) => { setCompetence(event.target.value); setResult(null); }} aria-invalid={isCompetence(competence) ? undefined : true} aria-describedby="fiscal-simples-batch-competence-hint" className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          {isCompetence(competence) ? (
            <span id="fiscal-simples-batch-competence-hint" className="text-xs font-normal text-gray-600 dark:text-gray-400">
              Alíquota para {formatCompetenceLabel(nextCompetence(competence))}
            </span>
          ) : (
            <span id="fiscal-simples-batch-competence-hint" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{INVALID_COMPETENCE_MESSAGE}</span>
          )}
        </label>
        <label className="grid content-start gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Anexo
          <select value={annex} onChange={(event) => { setAnnex(event.target.value as FiscalSimplesAnnexRate["annex"]); setResult(null); }} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
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
            className={FISCAL_TEXTAREA_CLASSNAME}
          />
          {documentsError ? <span id="fiscal-simples-batch-documents-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{documentsError}</span> : null}
        </label>
        <div className="md:col-span-3">
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={exportBatch.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
              {exportBatch.isPending && exportBatch.variables?.kind === "csv" ? EXPORTS.csv.pending : EXPORTS.csv.label}
            </button>
            <button type="button" disabled={exportBatch.isPending} onClick={() => void submitExport("zip")} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              {exportBatch.isPending && exportBatch.variables?.kind === "zip" ? EXPORTS.zip.pending : EXPORTS.zip.label}
            </button>
          </div>
        </div>
      </form>

      {result ? (
        <div className="space-y-3">
          <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
            {result.included.length} cliente(s) no arquivo · {result.skipped.length} ignorado(s)
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
      </div>
    </details>
  );
}

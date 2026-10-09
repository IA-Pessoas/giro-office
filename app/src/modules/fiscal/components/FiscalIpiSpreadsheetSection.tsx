import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  type FiscalConferenceRow,
  type FiscalIpiSpreadsheetConference,
  fiscalConferenceService,
} from "../services/fiscalConferenceService";
import { downloadFile, formatMoney, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmo teto do serviço (450 mil caracteres por planilha, dentro do 1 MB do gateway).
const MAX_FILE_BYTES = 450_000;

const SOURCES = [
  { id: "first", label: "Planilha 1" },
  { id: "second", label: "Planilha 2" },
] as const;

interface Line {
  situation: string;
  identity: string;
  first: string;
  second: string;
  difference: string;
  note: string;
}

const lineOf = (rows: FiscalConferenceRow[]) =>
  rows.map((row) => `linha ${row.line} · ${formatMoney(row.ipi)}`).join(" | ");

/** Mesma ordem do CSV exportado pelo serviço. */
function conferenceLines(result: FiscalIpiSpreadsheetConference): Line[] {
  const issue = (item: { source: "first" | "second"; line: number }) =>
    item.source === "first" ? { first: `linha ${item.line}`, second: "" } : { first: "", second: `linha ${item.line}` };
  return [
    ...result.matched.map((pair) => ({ situation: "Coincidente", identity: pair.identity, first: lineOf([pair.first]), second: lineOf([pair.second]), difference: formatMoney("0.00"), note: "" })),
    ...result.divergent.map((pair) => ({ situation: "Divergente", identity: pair.identity, first: lineOf([pair.first]), second: lineOf([pair.second]), difference: formatMoney(pair.difference), note: pair.differences.join(" | ") })),
    ...result.only_first.map((row) => ({ situation: "Só planilha 1", identity: row.identity, first: lineOf([row]), second: "", difference: "", note: "" })),
    ...result.only_second.map((row) => ({ situation: "Só planilha 2", identity: row.identity, first: "", second: lineOf([row]), difference: "", note: "" })),
    ...result.duplicates.map((item) => ({ situation: "Duplicada", identity: item.identity, first: lineOf(item.first), second: lineOf(item.second), difference: "", note: "Identidade repetida; sem correspondência automática" })),
    ...result.errors.map((item) => ({ situation: "Erro", identity: "", ...issue(item), difference: "", note: item.message })),
    ...result.discarded.map((item) => ({ situation: "Descartada", identity: "", ...issue(item), difference: "", note: item.reason })),
  ];
}

export function FiscalIpiSpreadsheetSection({ canEdit }: { canEdit: boolean }) {
  const [files, setFiles] = useState<Partial<Record<"first" | "second", File>>>({});
  const [result, setResult] = useState<FiscalIpiSpreadsheetConference | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const compare = useMutation({ mutationFn: fiscalConferenceService.compareIpiSpreadsheets });
  const lines = useMemo(() => (result ? conferenceLines(result) : []), [result]);
  const visible = onlyProblems ? lines.filter((line) => line.situation !== "Coincidente") : lines;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.first || !files.second) return;
    if (files.first.size > MAX_FILE_BYTES || files.second.size > MAX_FILE_BYTES) {
      toast.error("Planilha acima de 450 kB; divida o período em arquivos menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await compare.mutateAsync({ first: files.first, second: files.second }));
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section aria-labelledby="fiscal-ipi-spreadsheet-title" className="space-y-4">
      <div>
        <h2 id="fiscal-ipi-spreadsheet-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          IPI entre planilhas
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie duas planilhas CSV com a identidade da nota (chave de acesso ou CPF/CNPJ do emitente, modelo, série e número) e uma coluna de IPI (ex.: Valor IPI). O IPI de cada nota é comparado e a diferença é planilha 2 − planilha 1. IPI vazio aparece como erro, não como zero. Nada é gravado.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com exportações reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end dark:border-slate-700">
          {SOURCES.map((source) => (
            <label key={source.id} className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {source.label} (CSV)
              <input type="file" accept=".csv,.txt,text/csv,text/plain" required onChange={(event) => { const file = event.target.files?.[0]; setFiles((current) => ({ ...current, [source.id]: file })); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
            </label>
          ))}
          <button type="submit" disabled={!files.first || !files.second || compare.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {compare.isPending ? "Conferindo..." : "Conferir"}
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
              Conferência parcial: {result.summary.discarded} descarte(s), {result.summary.errors} erro(s) e {result.summary.duplicates} identidade(s) duplicada(s) ficaram sem correspondência.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todas as linhas das duas planilhas foram lidas e pareadas sem ambiguidade.
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">Identidade: {result.identity_rule}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {SOURCES.map((source) => (
              <div key={source.id} className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                <dt className="text-gray-600 dark:text-gray-400">{source.label}: {result.sources[source.id].file_name}</dt>
                <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(result.totals[source.id])}</dd>
                <dd className="text-xs text-gray-600 dark:text-gray-400">{result.sources[source.id].accepted_rows} de {result.sources[source.id].data_rows} linha(s)</dd>
              </div>
            ))}
            <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
              <dt className="text-gray-600 dark:text-gray-400">Diferença (2 − 1)</dt>
              <dd className="text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(result.totals.difference)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
              Ocultar coincidentes
            </label>
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Resultado da conferência de IPI entre planilhas</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Identidade</th>
                  <th className="px-4 py-2">Planilha 1</th>
                  <th className="px-4 py-2">Planilha 2</th>
                  <th className="px-4 py-2">Diferença</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {visible.map((line, index) => (
                  <tr key={`${line.situation}-${line.identity}-${line.first}-${line.second}-${index}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">{line.situation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.identity || "—"}</td>
                    <td className="px-4 py-2">{line.first || "—"}</td>
                    <td className="px-4 py-2">{line.second || "—"}</td>
                    <td className="px-4 py-2">{line.difference || "—"}</td>
                    <td className="px-4 py-2">{line.note}</td>
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

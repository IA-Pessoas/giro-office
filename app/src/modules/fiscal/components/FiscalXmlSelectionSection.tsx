import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { type FiscalXmlSelection, fiscalConferenceService } from "../services/fiscalConferenceService";
import { downloadFile, getFiscalErrorMessage, parseNoteRequests } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmo teto do serviço: ~650 kB de ZIP em base64 dentro do 1 MB do gateway.
const MAX_ZIP_BYTES = 650_000;

interface SelectionLine {
  situation: string;
  request: string;
  files: string;
  note: string;
}

/** Mesmas situações do relatorio-selecao.csv gerado pelo serviço. */
function selectionLines(result: FiscalXmlSelection): SelectionLine[] {
  return [
    ...result.selected.map((item) => ({ situation: "Selecionada", request: item.request, files: item.entry, note: item.access_key ?? item.identity })),
    ...result.ambiguous.map((item) => ({ situation: "Ambígua", request: item.request, files: item.candidates.map((candidate) => candidate.entry).join(", "), note: item.reason })),
    ...result.not_found.map((item) => ({ situation: "Não encontrada", request: item.request, files: "", note: "" })),
    ...result.invalid_requests.map((item) => ({ situation: "Pedido inválido", request: item.request, files: "", note: item.reason })),
    ...result.archive.errors.map((item) => ({ situation: "Erro no ZIP", request: "", files: item.entry, note: item.message })),
    ...result.archive.discarded.map((item) => ({ situation: "Descartado", request: "", files: item.entry, note: item.reason })),
    ...result.archive.duplicates.map((item) => ({ situation: "XML repetido", request: "", files: item.entries.join(", "), note: item.identical ? "Cópias idênticas" : "Cópias com conteúdo diferente" })),
  ];
}

export function FiscalXmlSelectionSection({ canEdit }: { canEdit: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [requestsText, setRequestsText] = useState("");
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [result, setResult] = useState<FiscalXmlSelection | null>(null);
  const select = useMutation({ mutationFn: fiscalConferenceService.selectXml });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const requests = parseNoteRequests(requestsText);
    if (requests.length === 0) {
      setRequestsError("Informe ao menos uma nota, uma por linha.");
      return;
    }
    setRequestsError(null);
    if (file.size > MAX_ZIP_BYTES) {
      toast.error("O ZIP excede 650 kB; divida as notas em arquivos menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await select.mutateAsync({ file, requests }));
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  const lines = result ? selectionLines(result) : [];

  return (
    <section aria-labelledby="fiscal-xml-selection-title" className="space-y-4">
      <div>
        <h2 id="fiscal-xml-selection-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          XML de notas em ZIP
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie um ZIP de XML de NF-e e liste as notas: chave de acesso, ou número, série;número, emitente;série;número ou emitente;modelo;série;número. Número repetido entre emitentes ou séries fica ambíguo e não entra no ZIP. Nada é gravado.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_2fr_auto] md:items-start dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Arquivo ZIP
            <input
              type="file"
              accept=".zip,application/zip"
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
              }}
              className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Notas (uma por linha)
            <textarea
              rows={5}
              value={requestsText}
              onChange={(event) => setRequestsText(event.target.value)}
              aria-invalid={requestsError ? true : undefined}
              aria-describedby={requestsError ? "fiscal-xml-selection-requests-error" : undefined}
              className={FISCAL_TEXTAREA_CLASSNAME}
            />
            {requestsError ? <span id="fiscal-xml-selection-requests-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{requestsError}</span> : null}
          </label>
          <button type="submit" disabled={!file || select.isPending} className={`${FISCAL_PRIMARY_BUTTON_CLASSNAME} md:mt-6`}>
            {select.isPending ? "Selecionando..." : "Selecionar XML"}
          </button>
        </form>
      ) : (
        <p role="note" className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-gray-400">
          Selecionar XML exige permissão de edição no Fiscal.
        </p>
      )}

      {result ? (
        <div className="space-y-3">
          {result.status === "partial" ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Seleção parcial: {result.ambiguous.length} ambígua(s), {result.not_found.length} não encontrada(s), {result.invalid_requests.length} pedido(s) inválido(s) e {result.archive.errors.length} arquivo(s) com erro no ZIP.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todas as notas pedidas foram encontradas sem ambiguidade.
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {result.archive.file_name}: {result.archive.entries} arquivo(s), {result.archive.nfe_entries} NF-e lida(s) · {result.selected.length} selecionada(s)
          </p>
          <div className="flex flex-wrap gap-3">
            {result.zip_base64 ? (
              <button
                type="button"
                onClick={() => downloadFile(new Blob([Uint8Array.from(atob(result.zip_base64 ?? ""), (char) => char.charCodeAt(0))], { type: "application/zip" }), result.file_name)}
                className={FISCAL_PRIMARY_BUTTON_CLASSNAME}
              >
                Baixar ZIP selecionado
              </button>
            ) : null}
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), "relatorio-selecao.csv")} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Baixar relatório CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Relatório da seleção de XML</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Arquivo(s)</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {lines.map((line, index) => (
                  <tr key={`${line.situation}-${line.request}-${line.files}-${index}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">{line.situation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.request || "—"}</td>
                    <td className="px-4 py-2">{line.files || "—"}</td>
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

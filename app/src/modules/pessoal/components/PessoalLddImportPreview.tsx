import { useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, FileUp, Loader2, Trash2, X } from "lucide-react";

import { fileToBase64 } from "@shared/utils/fileToBase64";
import { formatBrlDecimalInput } from "@shared/utils/inputFormatting";

import { usePreviewPessoalLddImportMutation } from "../hooks/usePessoalTracking";
import {
  buildLddImportDraftRows,
  lddImportDraftRowErrors,
  lddImportDraftTotal,
  validateLddPdfFile,
  type LddImportDraftRow,
} from "../utils/lddImportPreview";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import { pessoalSecondaryButtonClassName, pessoalTextFieldClassName } from "./pessoalFormControls";

type EditableField = "period" | "due_date" | "balance_amount";

/**
 * Envia o PDF LDD/INSS e mostra as linhas lidas para revisão. Nada é gravado: as edições ficam
 * só na tela, e descartar a prévia não deixa rastro.
 */
export function PessoalLddImportPreview({ clientId }: { clientId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewPessoalLddImportMutation();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<LddImportDraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function discard() {
    setRows(null);
    setFileName("");
    setError(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de descartar.
    event.target.value = "";
    if (!file) return;

    discard();
    const invalid = validateLddPdfFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    try {
      const preview = await previewMutation.mutateAsync({
        client_id: clientId,
        file_name: file.name,
        content_base64: await fileToBase64(file),
      });
      setFileName(preview.file_name);
      setRows(buildLddImportDraftRows(preview));
    } catch (err) {
      setError(getPessoalErrorMessage(err, "Não foi possível ler o PDF."));
    }
  }

  function updateRow(line: number, field: EditableField, value: string) {
    setRows(
      (current) =>
        current?.map((row) => (row.line === line ? { ...row, [field]: value } : row)) ?? null,
    );
  }

  function removeRow(line: number) {
    setRows((current) => current?.filter((row) => row.line !== line) ?? null);
  }

  const rowsWithErrors = rows?.filter((row) => lddImportDraftRowErrors(row).length > 0).length ?? 0;

  return (
    <div className="mb-6 space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Arquivo PDF do LDD"
        onChange={handleFile}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={previewMutation.isPending}
          className={pessoalSecondaryButtonClassName}
        >
          {previewMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4" />
          )}
          Importar PDF do LDD
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          PDF LDD/INSS de até 700 KB. As linhas lidas aparecem para revisão.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {rows ? (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Prévia da importação: {fileName}
              </h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Débitos previdenciários lidos do PDF. Nada foi gravado.
              </p>
            </div>
            <button type="button" onClick={discard} className={pessoalSecondaryButtonClassName}>
              <X className="h-4 w-4" />
              Descartar prévia
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Todas as linhas foram removidas da prévia.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Linha lida do PDF</th>
                    <th className="w-32 py-2 pr-3 font-medium">Competência</th>
                    <th className="w-40 py-2 pr-3 font-medium">Vencimento</th>
                    <th className="w-36 py-2 pr-3 font-medium">Valor</th>
                    <th className="w-10 py-2 font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((row) => {
                    const errors = lddImportDraftRowErrors(row);

                    return (
                      <tr key={row.line} className="align-top">
                        <td className="py-2 pr-3">
                          <p className="break-words font-mono text-xs text-gray-700 dark:text-gray-300">
                            {row.source}
                          </p>
                          {errors.length > 0 ? (
                            <ul className="mt-1 space-y-0.5 text-xs text-red-700 dark:text-red-300">
                              {errors.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="MM/AAAA"
                            maxLength={7}
                            aria-label={`Competência da linha ${row.line}`}
                            value={row.period}
                            onChange={(event) => updateRow(row.line, "period", event.target.value)}
                            className={pessoalTextFieldClassName}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="date"
                            aria-label={`Vencimento da linha ${row.line}`}
                            value={row.due_date}
                            onChange={(event) =>
                              updateRow(row.line, "due_date", event.target.value)
                            }
                            className={pessoalTextFieldClassName}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Valor da linha ${row.line}`}
                            value={row.balance_amount}
                            onChange={(event) =>
                              updateRow(row.line, "balance_amount", event.target.value)
                            }
                            onBlur={(event) =>
                              updateRow(
                                row.line,
                                "balance_amount",
                                formatBrlDecimalInput(event.target.value),
                              )
                            }
                            className={pessoalTextFieldClassName}
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row.line)}
                            aria-label={`Remover linha ${row.line} da prévia`}
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            {rows.length} linha(s), {rowsWithErrors} com erro. Total das linhas válidas:{" "}
            <strong>{formatBrlDecimalInput(lddImportDraftTotal(rows).toFixed(2)) || "R$ 0,00"}</strong>
          </p>
        </div>
      ) : null}
    </div>
  );
}

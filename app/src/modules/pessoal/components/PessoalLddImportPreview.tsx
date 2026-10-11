import { useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Check, FileUp, Loader2, Trash2, X } from "lucide-react";

import { fileToBase64 } from "@shared/utils/fileToBase64";
import { formatCivilDate } from "@shared/utils/dateFormat";
import { formatBrlAmount, formatBrlDecimalInput } from "@shared/utils/inputFormatting";

import {
  useConfirmPessoalLddImportMutation,
  usePreviewPessoalLddImportMutation,
} from "../hooks/usePessoalTracking";
import type { PessoalLdd } from "../types/tracking";
import {
  buildLddImportDraftRows,
  buildLddImportRows,
  editLddImportDraftRow,
  lddImportDraftTotal,
  summarizeLddImportByKey,
  validateLddPdfFile,
  type LddImportDraftField,
  type LddImportDraftRow,
} from "../utils/lddImportPreview";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";

/**
 * Envia o PDF LDD/INSS e mostra as linhas lidas para revisão. Nada é gravado até confirmar: as
 * edições ficam só na tela, e descartar a prévia não deixa rastro. A confirmação grava as linhas
 * sem erro; o servidor recusa o mesmo PDF pela segunda vez.
 */
export function PessoalLddImportPreview({
  clientId,
  existingLdd,
}: {
  clientId: string;
  /** LDD já cadastrados do cliente, para o saldo existente por chave; `null` enquanto não há lista confiável. */
  existingLdd: PessoalLdd[] | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewPessoalLddImportMutation();
  const confirmMutation = useConfirmPessoalLddImportMutation();
  const [pdf, setPdf] = useState({ name: "", hash: "", alreadyImportedAt: "" });
  const [rows, setRows] = useState<LddImportDraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function discard() {
    setRows(null);
    setPdf({ name: "", hash: "", alreadyImportedAt: "" });
    setError(null);
  }

  async function confirm() {
    if (!rows) return;
    setError(null);

    try {
      const result = await confirmMutation.mutateAsync({
        client_id: clientId,
        file_name: pdf.name,
        file_hash: pdf.hash,
        rows: buildLddImportRows(rows),
      });
      discard();
      setSuccess(
        `Importação concluída: ${result.rows_count} linha(s), ${formatBrlAmount(result.total_amount)} acrescidos ao LDD.`,
      );
    } catch (err) {
      // 409: o arquivo já entrou (outra aba ou clique repetido); trava a confirmação.
      if ((err as { response?: { status?: number } }).response?.status === 409) {
        setPdf((current) => ({ ...current, alreadyImportedAt: new Date().toISOString() }));
      }
      setError(getPessoalErrorMessage(err, "Não foi possível importar o LDD."));
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de descartar.
    event.target.value = "";
    if (!file) return;

    discard();
    setSuccess(null);
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
      setPdf({
        name: preview.file_name,
        hash: preview.file_hash,
        alreadyImportedAt: preview.already_imported_at ?? "",
      });
      setRows(buildLddImportDraftRows(preview));
    } catch (err) {
      setError(getPessoalErrorMessage(err, "Não foi possível ler o PDF."));
    }
  }

  function updateRow(line: number, field: LddImportDraftField, value: string) {
    setRows(
      (current) =>
        current?.map((row) =>
          row.line === line ? editLddImportDraftRow(row, field, value) : row,
        ) ?? null,
    );
  }

  function removeRow(line: number) {
    setRows((current) => current?.filter((row) => row.line !== line) ?? null);
  }

  const rowsWithErrors = rows?.filter((row) => row.errors.length > 0).length ?? 0;
  const keySummary = rows && existingLdd ? summarizeLddImportByKey(rows, existingLdd) : [];
  const canConfirm =
    keySummary.length > 0 &&
    rowsWithErrors === 0 &&
    !pdf.alreadyImportedAt &&
    !confirmMutation.isPending;

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

      {success ? (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-100"
        >
          {success}
        </p>
      ) : null}

      {rows ? (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Prévia da importação: {pdf.name}
              </h4>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Débitos previdenciários lidos do PDF. Nada é gravado antes da confirmação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={confirmMutation.isPending}
                className={pessoalSecondaryButtonClassName}
              >
                <X className="h-4 w-4" />
                Descartar prévia
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm}
                className={pessoalPrimaryButtonClassName}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Confirmar importação
              </button>
            </div>
          </div>

          {pdf.alreadyImportedAt ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"
            >
              Este PDF já foi importado para este cliente em{" "}
              {formatCivilDate(pdf.alreadyImportedAt)}.
              Importar de novo não altera o saldo.
            </p>
          ) : rowsWithErrors > 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Corrija ou remova as linhas com erro para confirmar.
            </p>
          ) : existingLdd ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Depois de confirmar, este PDF não poderá ser importado de novo para o cliente. Linhas
              removidas da prévia terão de ser cadastradas à mão.
            </p>
          ) : !existingLdd ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Aguardando a lista de LDD do cliente para mostrar o saldo cadastrado. Use
              &quot;Atualizar&quot; se ela não carregar.
            </p>
          ) : null}

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
                    const { errors } = row;

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
            <strong>{formatBrlAmount(lddImportDraftTotal(rows))}</strong>
          </p>

          {keySummary.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <caption className="pb-2 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  O que será gravado, por competência e vencimento
                </caption>
                <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Competência</th>
                    <th className="py-2 pr-3 font-medium">Vencimento</th>
                    <th className="py-2 pr-3 font-medium">Saldo cadastrado</th>
                    <th className="py-2 pr-3 font-medium">Acréscimo</th>
                    <th className="py-2 font-medium">Novo saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700 dark:divide-gray-700 dark:text-gray-300">
                  {keySummary.map((item) => (
                    <tr key={`${item.period}|${item.due_date}`}>
                      <td className="py-2 pr-3">{item.period}</td>
                      <td className="py-2 pr-3">{formatCivilDate(item.due_date)}</td>
                      <td className="py-2 pr-3">{formatBrlAmount(item.existing)}</td>
                      <td className="py-2 pr-3">{formatBrlAmount(item.increase)}</td>
                      <td className="py-2 font-semibold">{formatBrlAmount(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

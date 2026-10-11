import { useState } from "react";

import { createCsv, downloadCsvFile } from "../../marketing/utils/marketingCsv";
import { useCompareRegularizeVeriMutation } from "../hooks/useRegularizeOperations";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import {
  VERI_MAX_FILE_BYTES,
  VERI_XLSX_MIME_TYPE,
  veriComparisonColumns,
  veriComparisonCsvRows,
  veriComparisonRows,
} from "../utils/veriComparison";
import {
  regularizePanelAlertClassName,
  regularizePanelClassName,
  regularizePanelLabelClassName,
  regularizePanelTableCellClassName as cellClassName,
  regularizePrimaryButtonClassName,
  regularizeSecondaryButtonClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

// Comparador Veri (#1755): a planilha é lida no serviço e nada fica gravado; o resultado só
// existe nesta tela até a próxima comparação. Por isso basta o acesso de leitura ao módulo.
export function RegularizeVeriComparison() {
  const [file, setFile] = useState<File | null>(null);
  const compareMutation = useCompareRegularizeVeriMutation();
  const comparison = compareMutation.data;
  const tooLarge = Boolean(file && file.size > VERI_MAX_FILE_BYTES);
  const columns = comparison ? veriComparisonColumns(comparison.totals) : [];
  const rows = comparison ? veriComparisonRows(comparison) : [];

  return (
    <section className={regularizePanelClassName}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Comparador Veri</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Envie a planilha XLSX do Veri para comparar com os clientes ativos ou em processo de
        inativação, pelo CPF/CNPJ. A leitura começa na linha 3, com a razão social na coluna A e o
        CNPJ na coluna C. Ela foi validada apenas com planilhas sintéticas, sem uma exportação
        real do Veri: confira o resultado.
      </p>

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (file) compareMutation.mutate(file);
        }}
      >
        <label className={regularizePanelLabelClassName}>
          Planilha XLSX (até 2 MB)
          <input
            type="file"
            accept={`.xlsx,${VERI_XLSX_MIME_TYPE}`}
            className={`${regularizeTextFieldClassName} mt-1.5`}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={compareMutation.isPending}
            aria-invalid={tooLarge}
          />
        </label>
        <button
          type="submit"
          disabled={compareMutation.isPending || !file || tooLarge}
          className={regularizePrimaryButtonClassName}
        >
          {compareMutation.isPending ? "Comparando…" : "Comparar"}
        </button>
      </form>

      {tooLarge ? (
        <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">
          A planilha passa de 2 MB. Envie um arquivo menor.
        </p>
      ) : null}
      {compareMutation.isError ? (
        <p role="alert" className={regularizePanelAlertClassName}>
          {getRegularizeMutationErrorMessage(
            compareMutation.error,
            "Não foi possível comparar a planilha. Confira o arquivo e tente novamente.",
          )}
        </p>
      ) : null}

      {comparison ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700 dark:text-slate-200" role="status">
              {comparison.totals.both} nos dois · {comparison.totals.veri_only} só no Veri ·{" "}
              {comparison.totals.workspace_only} só no Workspace · {comparison.totals.invalid}{" "}
              linhas inválidas
              {comparison.totals.workspace_without_document
                ? ` · ${comparison.totals.workspace_without_document} clientes sem CPF/CNPJ no cadastro, fora da comparação`
                : ""}
              {comparison.totals.workspace_duplicate_documents
                ? ` · ${comparison.totals.workspace_duplicate_documents} clientes com CPF/CNPJ repetido no cadastro, contados uma vez`
                : ""}
            </p>
            <button
              type="button"
              disabled={!rows.length && !comparison.invalid.length}
              onClick={() =>
                downloadCsvFile(
                  "comparador-veri.csv",
                  createCsv([columns, ...veriComparisonCsvRows(comparison)]),
                )
              }
              className={regularizeSecondaryButtonClassName}
            >
              Baixar CSV
            </button>
          </div>

          {comparison.invalid.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Linhas da planilha que não entraram na comparação
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {comparison.invalid.map((entry) => (
                  <li key={entry.row}>
                    Linha {entry.row}
                    {entry.name ? ` (${entry.name})` : ""}: {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className={cellClassName}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 dark:divide-slate-800 dark:text-slate-100">
                  {rows.map((row, index) => (
                    <tr key={comparison.rows[index]?.document}>
                      {row.map((cell, cellIndex) => (
                        <td key={columns[cellIndex]} className={cellClassName}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Nenhum CPF/CNPJ para comparar: a planilha não tem linhas válidas e não há clientes
              ativos ou em processo de inativação com documento.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

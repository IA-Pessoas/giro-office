import { Eye, Loader2 } from "lucide-react";

import { Button } from "@shared/ui/newLayout/button";

import type { ReportPreviewResult } from "../types/report.types";
import { ReportStep, reportMutedClassName } from "./ReportStep";

export function ReportPreviewStep({
  result,
  error,
  isPending,
  canPreview,
  onPreview,
}: {
  result?: ReportPreviewResult;
  error?: { message: string } | null;
  isPending: boolean;
  canPreview: boolean;
  onPreview: () => void;
}) {
  return (
    <ReportStep
      title="6. Prévia"
      description="Confira uma amostra segura antes de salvar ou exportar. A prévia não cria job nem altera dados."
    >
      <div className="space-y-5">
        <Button type="button" onClick={onPreview} disabled={isPending || !canPreview}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {isPending ? "Gerando prévia..." : "Gerar prévia"}
        </Button>
        {!canPreview ? (
          <p className={reportMutedClassName} role="status">
            Selecione ao menos um campo publicado antes de gerar a prévia.
          </p>
        ) : null}

        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error.message}</p> : null}

        {result ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
            <div className="flex flex-col gap-1 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-gray-900 dark:text-white">
                {result.rows.length === 0 ? "Nenhum registro encontrado" : `${result.rows.length} registro(s) na amostra`}
              </p>
              <p className={reportMutedClassName}>
                Limite efetivo: {result.limit}{result.hasMore ? " · Há mais registros" : " · Resultado completo"}
              </p>
            </div>
            {result.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-600 dark:text-slate-400">
                A consulta foi válida, mas não encontrou registros para os critérios informados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-white dark:bg-slate-900">
                    <tr>{result.columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-slate-300">{column.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                    {result.rows.map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-slate-400">{formatPreviewValue(row[column.key])}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className={reportMutedClassName}>A prévia aparecerá aqui depois que você solicitar a consulta.</p>
        )}
      </div>
    </ReportStep>
  );
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

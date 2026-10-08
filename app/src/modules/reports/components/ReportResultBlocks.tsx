import { Fragment } from "react";
import type { ReportResultBlock, ReportSnapshotBlock } from "../types/report.types";
import { ReportChartPanel } from "./ReportChartPanel";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function ReportResultBlocks({
  blocks,
  snapshot = false,
  preview = false,
}: {
  blocks: Array<ReportResultBlock | ReportSnapshotBlock>;
  snapshot?: boolean;
  preview?: boolean;
}) {
  return (
    <div className="space-y-5" aria-label="Resultados do relatório">
      {blocks.map((block, index) => {
        const count = snapshot && "rowCount" in block ? block.rowCount : block.rows.length;
        const chartRows = block.rows.map((row) => snapshot && "rowCount" in block ? row.values : row);
        const visibleColumns = block.columns.filter((column) => !column.hidden);
        return (
          <section
            key={`${block.source}-${index}`}
            aria-label={`${preview ? "Prévia" : "Resultado"} de ${block.label}`}
            className="min-w-0 space-y-2 border-t border-gray-200 pt-4 dark:border-slate-700"
          >
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{block.label}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {count} {count === 1 ? "registro" : "registros"}
              </p>
            </div>
            {block.rows.length > 0 ? (
              <ReportChartPanel
                columns={block.columns}
                rows={chartRows}
                dimensions={block.dimensions}
                rowCount={count}
                hasMore={"hasMore" in block && block.hasMore === true}
              />
            ) : null}
            {block.rows.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Nenhum registro encontrado nesta área. Ajuste os critérios se necessário.
              </p>
            ) : (
              <div
                className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700"
                tabIndex={0}
                role="region"
                aria-label={"Dados de " + block.label}
              >
                <table className="min-w-full text-left text-sm text-gray-800 dark:text-slate-200">
                  <thead className="bg-gray-50 dark:bg-slate-800/70">
                    <tr>
                      {visibleColumns.map((column) => (
                        <th key={column.key} scope="col" className="px-3 py-2 font-semibold">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, index) => {
                      const values = snapshot && "rowCount" in block ? row.values : row;
                      const previous = block.rows[index - 1];
                      const previousValues = previous && snapshot && "rowCount" in block ? previous.values : previous;
                      const dimensions = block.layout === "grouped_list" ? block.dimensions ?? [] : [];
                      const group = JSON.stringify(dimensions.map((key) => values[key] ?? null));
                      const previousGroup = previousValues
                        ? JSON.stringify(dimensions.map((key) => previousValues[key] ?? null))
                        : undefined;
                      return (
                        <Fragment key={index}>
                          {dimensions.length > 0 && group !== previousGroup ? (
                            <tr className="bg-gray-50 dark:bg-slate-800/70">
                              <th scope="row" colSpan={visibleColumns.length} className="px-3 py-2 text-left font-semibold">
                                {dimensions.map((key) => values[key] == null ? "Sem valor" : String(values[key])).join(" / ")}
                              </th>
                            </tr>
                          ) : null}
                          <tr className="border-t border-gray-200 dark:border-slate-700">
                            {visibleColumns.map((column) => (
                              <td key={column.key} className="px-3 py-2">
                                {displayValue(values[column.key])}
                              </td>
                            ))}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

import type { ReportResultBlock, ReportSnapshotBlock } from "../types/report.types";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function ReportResultBlocks({
  blocks,
  snapshot = false,
}: {
  blocks: Array<ReportResultBlock | ReportSnapshotBlock>;
  snapshot?: boolean;
}) {
  return (
    <div className="space-y-5" aria-label="Resultados do relatório">
      {blocks.map((block) => {
        const count = snapshot && "rowCount" in block ? block.rowCount : block.rows.length;
        return (
          <section
            key={block.source}
            aria-label={"Resultado de " + block.label}
            className="min-w-0 space-y-2 border-t border-gray-200 pt-4 dark:border-slate-700"
          >
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{block.label}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {count} {count === 1 ? "registro" : "registros"}
              </p>
            </div>
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
                      {block.columns.map((column) => (
                        <th key={column.key} scope="col" className="px-3 py-2 font-semibold">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, index) => (
                      <tr key={index} className="border-t border-gray-200 dark:border-slate-700">
                        {block.columns.map((column) => (
                          <td key={column.key} className="px-3 py-2">
                            {displayValue(
                              snapshot && "rowCount" in block
                                ? row.values[column.key]
                                : row[column.key],
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
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

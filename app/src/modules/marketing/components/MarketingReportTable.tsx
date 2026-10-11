/** Tabela dos relatórios imprimíveis de Marketing; recebe as mesmas linhas usadas no CSV. */
export function MarketingReportTable({
  title,
  columns,
  ids,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: readonly string[];
  ids: readonly string[];
  rows: readonly (readonly string[])[];
  emptyMessage: string;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        {title} · {rows.length} {rows.length === 1 ? "registro" : "registros"}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300">
              <tr>
                {columns.map((column) => (
                  <th className="py-2 pr-3 font-medium" key={column} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-slate-700 dark:text-slate-100">
              {rows.map((row, rowIndex) => (
                <tr key={ids[rowIndex]}>
                  {row.map((cell, index) => (
                    <td className="py-2 pr-3" key={columns[index]}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

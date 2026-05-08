import { Edit, Eye, Trash2 } from "lucide-react";

import type { RhRequestRow } from "../types";

interface RhRequestsTableProps {
  rows: RhRequestRow[];
  onOpenDetail: (requestId: string) => void;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
  deletingRequestId: string | null;
}

export function RhRequestsTable({
  rows,
  onOpenDetail,
  onEdit,
  onDelete,
  deletingRequestId,
}: RhRequestsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div>
        <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="w-[25%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Título
              </th>
              <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Categoria
              </th>
              <th className="w-[13%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Responsável
              </th>
              <th className="w-[10%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Urgência
              </th>
              <th className="w-[10%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Status
              </th>
              <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Atualizado
              </th>
              <th className="w-[16%] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-4 align-top">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold leading-6 text-gray-900 dark:text-white">
                      {row.title}
                    </p>
                    <p className="line-clamp-4 break-words text-[13px] leading-5 text-gray-600 dark:text-gray-400">
                      {row.description}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4 text-[13px] leading-5 text-gray-700 dark:text-gray-300">
                  {row.categoryLabel}
                </td>
                <td className="px-4 py-4 text-[13px] leading-5 text-gray-700 dark:text-gray-300">
                  {row.assignedToUserLabel}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.urgencyClassName}`}
                  >
                    {row.urgencyLabel}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.statusClassName}`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-4 text-[13px] leading-5 text-gray-700 dark:text-gray-300">
                  {row.updatedAtLabel}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingRequestId === row.id ? "..." : "Excluir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

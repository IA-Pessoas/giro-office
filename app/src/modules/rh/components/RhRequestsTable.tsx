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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Título
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Responsável
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Urgência
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Atualizado
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td className="px-6 py-4 align-top">
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {row.title}
                    </p>
                    <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">
                      {row.description}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {row.categoryLabel}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {row.assignedToUserLabel}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.urgencyClassName}`}
                  >
                    {row.urgencyLabel}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.statusClassName}`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                  {row.updatedAtLabel}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Eye className="h-4 w-4" />
                      Detalhes
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Edit className="h-4 w-4" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
                      disabled={deletingRequestId === row.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingRequestId === row.id ? "Excluindo..." : "Excluir"}
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

import { Edit, Eye, Trash2 } from "lucide-react";

import type { RhRequestRow } from "../types";

interface RhRequestsTableProps {
  rows: RhRequestRow[];
  canManageRequests: boolean;
  showRequester: boolean;
  onOpenDetail: (requestId: string) => void;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
  deletingRequestId: string | null;
}

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[84px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function RhRequestsTable({
  rows,
  canManageRequests,
  showRequester,
  onOpenDetail,
  onEdit,
  onDelete,
  deletingRequestId,
}: RhRequestsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <th className="w-[22%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Título
            </th>
            {showRequester ? (
              <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                Solicitante
              </th>
            ) : null}
            <th className="w-[15%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Categoria
            </th>
            <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Responsável
            </th>
            <th className="w-[10%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Urgência
            </th>
            <th className="w-[10%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Status
            </th>
            <th className="w-[10%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Atualizado
            </th>
            <th className="w-[15%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30">
              <td className="px-5 py-2.5 align-top">
                <div className="space-y-1">
                  <p className="text-sm font-semibold leading-5 text-gray-900 dark:text-white">
                    {row.title}
                  </p>
                  <p className="line-clamp-3 max-w-[240px] break-words text-[13px] leading-5 text-gray-600 dark:text-gray-400">
                    {row.description}
                  </p>
                </div>
              </td>
              {showRequester ? (
                <td className="px-4 py-2.5 align-middle text-[13px] font-medium leading-5 text-gray-700 dark:text-gray-300">
                  {row.requesterUserLabel}
                </td>
              ) : null}
              <td className="px-4 py-2.5 align-middle text-[13px] font-medium leading-5 text-gray-700 dark:text-gray-300">
                {row.categoryLabel}
              </td>
              <td className="px-4 py-2.5 align-middle text-[13px] font-medium leading-5 text-gray-700 dark:text-gray-300">
                {row.assignedToUserLabel}
              </td>
              <td className="px-4 py-2.5 align-middle">
                <span
                  className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium ${row.urgencyClassName}`}
                >
                  {row.urgencyLabel}
                </span>
              </td>
              <td className="px-4 py-2.5 align-middle">
                <span
                  className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium ${row.statusClassName}`}
                >
                  {row.statusLabel}
                </span>
              </td>
              <td className="px-4 py-2.5 align-middle text-[13px] leading-5 text-gray-700 dark:text-gray-300">
                {row.updatedAtLabel}
              </td>
              <td className="px-5 py-2.5 align-middle text-right">
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(row.id)}
                    disabled={deletingRequestId === row.id}
                    className={`${ACTION_BUTTON_CLASSNAME} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </button>
                  {canManageRequests ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onEdit(row.id)}
                        disabled={deletingRequestId === row.id}
                        className={`${ACTION_BUTTON_CLASSNAME} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row.id)}
                        disabled={deletingRequestId === row.id}
                        className={`${ACTION_BUTTON_CLASSNAME} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingRequestId === row.id ? "Excluindo" : "Excluir"}
                      </button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

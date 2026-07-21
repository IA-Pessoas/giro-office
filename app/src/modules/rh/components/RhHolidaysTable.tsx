import { Edit, Trash2 } from "lucide-react";

import type { RhHoliday } from "../types";
import { formatRhDate } from "../utils/rhDate";

interface RhHolidaysTableProps {
  holidays: RhHoliday[];
  onEdit?: (holiday: RhHoliday) => void;
  onDelete?: (holiday: RhHoliday) => void;
  deletingHolidayId?: string | null;
}

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[84px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function RhHolidaysTable({
  holidays,
  onEdit,
  onDelete,
  deletingHolidayId = null,
}: RhHolidaysTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <th className="w-[48%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Nome
            </th>
            <th className="w-[24%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Data
            </th>
            <th className="w-[28%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {holidays.map((holiday) => {
            const isDeleting = deletingHolidayId === holiday.id;

            return (
              <tr key={holiday.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {holiday.name.trim()}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatRhDate(holiday.date)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit?.(holiday)}
                      disabled={!onEdit || isDeleting}
                      className={`${ACTION_BUTTON_CLASSNAME} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700`}
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(holiday)}
                      disabled={!onDelete || isDeleting}
                      className={`${ACTION_BUTTON_CLASSNAME} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeleting ? "Excluindo" : "Excluir"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

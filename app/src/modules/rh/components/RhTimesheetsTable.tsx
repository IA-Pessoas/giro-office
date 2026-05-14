import { FileSignature } from "lucide-react";

import type { RhTimeSheet } from "../types";
import { formatRhDateTime } from "../utils/rhDate";

interface RhTimesheetsTableProps {
  timeSheets: RhTimeSheet[];
  currentUserId: string;
  signingSheetId: string | null;
  getUserLabel: (userId: string) => string;
  onSign: (sheet: RhTimeSheet) => void;
}

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[96px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function RhTimesheetsTable({
  timeSheets,
  currentUserId,
  signingSheetId,
  getUserLabel,
  onSign,
}: RhTimesheetsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <th className="w-[20%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Início
            </th>
            <th className="w-[20%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Fim
            </th>
            <th className="w-[18%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Colaborador
            </th>
            <th className="w-[16%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Status
            </th>
            <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Assinatura
            </th>
            <th className="w-[12%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {timeSheets.map((sheet) => {
            const isSigning = signingSheetId === sheet.id;
            const canSign = sheet.user_id === currentUserId && !sheet.signature;

            return (
              <tr
                key={sheet.id}
                className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td className="px-5 py-3 text-sm text-gray-900 dark:text-white">
                  {formatRhDateTime(sheet.start_time)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {formatRhDateTime(sheet.end_time)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {getUserLabel(sheet.user_id)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      sheet.signature
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                    }`}
                  >
                    {sheet.signature ? "Assinada" : "Pendente"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {sheet.signature ? (
                    <span className="line-clamp-2 break-words">{sheet.signature}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">-</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {canSign ? (
                    <button
                      type="button"
                      onClick={() => onSign(sheet)}
                      disabled={isSigning}
                      className={`${ACTION_BUTTON_CLASSNAME} border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20`}
                    >
                      <FileSignature className="h-3.5 w-3.5" />
                      {isSigning ? "Assinando" : "Assinar"}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      {sheet.signature ? "Concluído" : "Sem ação"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

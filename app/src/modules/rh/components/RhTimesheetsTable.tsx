import { Eye, FileSignature } from "lucide-react";

import type { RhTimeSheetListItem } from "../types";
import { formatRhDateTime } from "../utils/rhDate";
import { formatRhDuration } from "../utils/rhDuration";

interface RhTimesheetsTableProps {
  timeSheets: RhTimeSheetListItem[];
  currentUserId: string;
  canManageTimesheets: boolean;
  signingSheetId: string | null;
  reopeningSheetId: string | null;
  rebuildingSheetId: string | null;
  getUserLabel: (userId: string) => string;
  onSign: (sheet: RhTimeSheetListItem) => void;
  onReopen: (sheet: RhTimeSheetListItem) => void;
  onRebuild: (sheet: RhTimeSheetListItem) => void;
  onViewDetail: (timesheetId: string) => void;
}

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[96px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function RhTimesheetsTable({
  timeSheets,
  currentUserId,
  canManageTimesheets,
  signingSheetId,
  reopeningSheetId,
  rebuildingSheetId,
  getUserLabel,
  onSign,
  onReopen,
  onRebuild,
  onViewDetail,
}: RhTimesheetsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <th className="w-[16%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Início
            </th>
            <th className="w-[16%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Fim
            </th>
            <th className="w-[16%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Colaborador
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Status
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Trabalhado
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Saldo
            </th>
            <th className="w-[16%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {timeSheets.map((sheet) => {
            const isSigning = signingSheetId === sheet.id;
            const isReopening = reopeningSheetId === sheet.id;
            const isRebuilding = rebuildingSheetId === sheet.id;
            const canSign = sheet.user_id === currentUserId && !sheet.signature;

            return (
              <tr key={sheet.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30">
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
                    {sheet.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {formatRhDuration(sheet.worked_minutes)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {formatRhDuration(sheet.balance_minutes, { showPositiveSign: true })}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-end gap-2">
                    {sheet.has_details ? (
                      <button
                        type="button"
                        onClick={() => onViewDetail(sheet.id)}
                        className={`${ACTION_BUTTON_CLASSNAME} border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Abrir folha
                      </button>
                    ) : (
                      <span className="text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                        Detalhe indisponível
                      </span>
                    )}

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

                    {canManageTimesheets && sheet.signature ? (
                      <button
                        type="button"
                        onClick={() => onReopen(sheet)}
                        disabled={isReopening}
                        className={`${ACTION_BUTTON_CLASSNAME} border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/20`}
                      >
                        {isReopening ? "Reabrindo" : "Reabrir folha"}
                      </button>
                    ) : null}

                    {canManageTimesheets && !sheet.signature ? (
                      <button
                        type="button"
                        onClick={() => onRebuild(sheet)}
                        disabled={isRebuilding}
                        className={`${ACTION_BUTTON_CLASSNAME} border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/20`}
                      >
                        {isRebuilding ? "Atualizando" : "Atualizar folha"}
                      </button>
                    ) : null}
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

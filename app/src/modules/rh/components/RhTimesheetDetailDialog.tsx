import { useMemo } from "react";

import { Dialog } from "@shared/components";
import { useRhTimeSheetDetail } from "../hooks/useRhCalendar";
import { formatRhDate, formatRhDateTime } from "../utils/rhDate";

interface RhTimesheetDetailDialogProps {
  open: boolean;
  timesheetId: string | null;
  onClose: () => void;
}

function formatMinutes(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(value);
  const hours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;

  if (hours === 0) {
    return `${sign}${remainingMinutes}min`;
  }

  if (remainingMinutes === 0) {
    return `${sign}${hours}h`;
  }

  return `${sign}${hours}h ${remainingMinutes}min`;
}

export function RhTimesheetDetailDialog({
  open,
  timesheetId,
  onClose,
}: RhTimesheetDetailDialogProps) {
  const detailQuery = useRhTimeSheetDetail(timesheetId, open);

  const totals = useMemo(() => detailQuery.data?.totals ?? null, [detailQuery.data]);
  const days = detailQuery.data?.days ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Detalhe da folha de ponto"
      description="Resumo consolidado com dias e totais do período"
      contentClassName="w-[min(96vw,1100px)]"
      bodyClassName="space-y-5"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Fechar
        </button>
      }
    >
      {detailQuery.isLoading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Carregando detalhe da folha...
        </div>
      ) : null}

      {!detailQuery.isLoading && detailQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar o detalhe da folha de ponto.
        </div>
      ) : null}

      {!detailQuery.isLoading && !detailQuery.error && detailQuery.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Início
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {formatRhDateTime(detailQuery.data.start_time)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Fim
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {formatRhDateTime(detailQuery.data.end_time)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Trabalhado
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {totals ? formatMinutes(totals.worked_minutes) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Esperado
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {totals ? formatMinutes(totals.expected_minutes) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Saldo
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {totals ? formatMinutes(totals.balance_minutes) : "-"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Dias consolidados</h3>
            </div>

            {days.length === 0 ? (
              <div className="p-5 text-sm text-gray-600 dark:text-gray-300">
                Esta folha não possui dias consolidados para exibição.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Data
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Entrada
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Saída almoço
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Volta almoço
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Saída
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Trabalhado
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Esperado
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Saldo
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {days.map((day) => (
                      <tr key={day.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {formatRhDate(day.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {day.clock_in ? formatRhDateTime(day.clock_in) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {day.lunch_out ? formatRhDateTime(day.lunch_out) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {day.lunch_in ? formatRhDateTime(day.lunch_in) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {day.clock_out ? formatRhDateTime(day.clock_out) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {formatMinutes(day.worked_minutes)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {formatMinutes(day.expected_minutes)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {formatMinutes(day.balance_minutes)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {day.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

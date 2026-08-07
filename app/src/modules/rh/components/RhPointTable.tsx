import type { RhPointListItem } from "../types";
import { formatRhDateTime } from "../utils/rhDate";

interface RhPointTableProps {
  points: RhPointListItem[];
  isLoading: boolean;
  hasError: boolean;
  currentUserId: string;
  onRequestAdjustment: (point: RhPointListItem) => void;
}

function formatWorkloadLabel(totalMinutes: number | null) {
  if (totalMinutes === null || totalMinutes === undefined) {
    return "-";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatBalanceLabel(balanceMinutes: number | null) {
  if (balanceMinutes === null || balanceMinutes === undefined) {
    return "-";
  }

  const signal = balanceMinutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(balanceMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${signal}${hours}h${String(minutes).padStart(2, "0")}`;
}

export function RhPointTable({
  points,
  isLoading,
  hasError,
  currentUserId,
  onRequestAdjustment,
}: RhPointTableProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Histórico de registros
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Os registros dos últimos 5 dias úteis do mês selecionado serão listados aqui.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Carregando registros de ponto...
        </div>
      ) : hasError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os registros de ponto.
        </div>
      ) : points.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Nenhum registro encontrado para o período selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto u-scrollbar-system">
          <table className="min-w-[960px] w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
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
                  Horas
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                  Saldo
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {points.map((point) => (
                <tr
                  key={point.id}
                  className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {formatRhDateTime(point.clock_in)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatRhDateTime(point.lunch_out)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatRhDateTime(point.lunch_in)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatRhDateTime(point.clock_out)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatWorkloadLabel(point.workload_hours)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatBalanceLabel(point.time_bank_balance)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {point.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {point.user_id === currentUserId ? (
                      <button
                        type="button"
                        onClick={() => onRequestAdjustment(point)}
                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20"
                      >
                        Solicitar ajuste
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Sem ação</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

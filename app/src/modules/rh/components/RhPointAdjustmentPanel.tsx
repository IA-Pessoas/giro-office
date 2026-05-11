import { toast } from "react-toastify";

import { useApproveRhPointAdjustmentMutation } from "../hooks/useRhPoint";
import type { RhPointAdjustmentRequest } from "../types";
import { formatRhDate, formatRhDateTime } from "../utils/rhDate";

interface RhPointAdjustmentPanelProps {
  adjustments: RhPointAdjustmentRequest[];
  isLoading: boolean;
  hasError: boolean;
  canManagePoint: boolean;
  currentUserId: string;
  getUserLabel: (userId: string) => string;
}

export function RhPointAdjustmentPanel({
  adjustments,
  isLoading,
  hasError,
  canManagePoint,
  currentUserId,
  getUserLabel,
}: RhPointAdjustmentPanelProps) {
  const approveMutation = useApproveRhPointAdjustmentMutation();

  async function handleApprove(request: RhPointAdjustmentRequest) {
    try {
      await approveMutation.mutateAsync({ request_id: request.id });
      toast.success("Solicitação aprovada com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível aprovar o ajuste.";
      toast.error(message);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Ajustes de ponto
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Solicitações pendentes e histórico de ajustes.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Carregando ajustes...
        </div>
      ) : hasError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os ajustes de ponto.
        </div>
      ) : adjustments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Nenhum ajuste encontrado para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-3">
          {adjustments.map((adjustment) => {
            const canApprove =
              canManagePoint &&
              adjustment.status === "Pendente" &&
              adjustment.user_id !== currentUserId;

            return (
              <div
                key={adjustment.id}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {getUserLabel(adjustment.user_id)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          adjustment.status === "Aprovado"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                        }`}
                      >
                        {adjustment.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Data referência: {formatRhDate(adjustment.date)}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {adjustment.justification}
                    </p>
                    <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2 xl:grid-cols-4">
                      <span>Entrada: {formatRhDateTime(adjustment.clock_in)}</span>
                      <span>Saída almoço: {formatRhDateTime(adjustment.lunch_out)}</span>
                      <span>Volta almoço: {formatRhDateTime(adjustment.lunch_in)}</span>
                      <span>Saída: {formatRhDateTime(adjustment.clock_out)}</span>
                    </div>
                  </div>

                  {canApprove ? (
                    <button
                      type="button"
                      onClick={() => handleApprove(adjustment)}
                      disabled={approveMutation.isPending}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {approveMutation.isPending &&
                      approveMutation.variables?.request_id === adjustment.id
                        ? "Aprovando..."
                        : "Aprovar"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

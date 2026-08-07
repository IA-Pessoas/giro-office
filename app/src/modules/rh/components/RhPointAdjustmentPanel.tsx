import { useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";

import {
  useApproveRhPointAdjustmentMutation,
  useRejectRhPointAdjustmentMutation,
} from "../hooks/useRhPoint";
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

type AdjustmentDecision = {
  action: "approve" | "reject";
  adjustment: RhPointAdjustmentRequest;
};

export function RhPointAdjustmentPanel({
  adjustments,
  isLoading,
  hasError,
  canManagePoint,
  currentUserId,
  getUserLabel,
}: RhPointAdjustmentPanelProps) {
  const approveMutation = useApproveRhPointAdjustmentMutation();
  const rejectMutation = useRejectRhPointAdjustmentMutation();
  const [decision, setDecision] = useState<AdjustmentDecision | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const isDecisionPending = approveMutation.isPending || rejectMutation.isPending;

  function openDecision(action: AdjustmentDecision["action"], adjustment: RhPointAdjustmentRequest) {
    setRejectionReason("");
    setDecision({ action, adjustment });
  }

  function closeDecision() {
    if (isDecisionPending) {
      return;
    }

    setDecision(null);
    setRejectionReason("");
  }

  async function handleDecision() {
    if (!decision) {
      return;
    }

    try {
      if (decision.action === "approve") {
        await approveMutation.mutateAsync({ request_id: decision.adjustment.id });
        toast.success("Solicitação aceita com sucesso.");
      } else {
        await rejectMutation.mutateAsync({
          request_id: decision.adjustment.id,
          obs_approver: rejectionReason.trim() || null,
        });
        toast.success("Solicitação rejeitada com sucesso.");
      }
      closeDecision();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível decidir o ajuste.";
      toast.error(message);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Ajustes de ponto</h3>
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
            const canDecide =
              canManagePoint &&
              adjustment.status === "Pendente" &&
              adjustment.user_id !== currentUserId;

            return (
              <div
                key={adjustment.id}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">
                        {getUserLabel(adjustment.user_id)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          adjustment.status === "Aprovado"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : adjustment.status === "Rejeitado"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                        }`}
                      >
                        {adjustment.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Data de referência: {formatRhDate(adjustment.date)}
                    </p>
                    <p className="break-words text-sm text-gray-700 dark:text-gray-300">
                      {adjustment.justification}
                    </p>
                    {adjustment.obs_approver ? (
                      <p className="break-words text-sm text-gray-600 dark:text-gray-400">
                        Justificativa da decisão: {adjustment.obs_approver}
                      </p>
                    ) : null}
                    <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2 xl:grid-cols-4">
                      <span>Entrada: {formatRhDateTime(adjustment.clock_in)}</span>
                      <span>Saída almoço: {formatRhDateTime(adjustment.lunch_out)}</span>
                      <span>Volta almoço: {formatRhDateTime(adjustment.lunch_in)}</span>
                      <span>Saída: {formatRhDateTime(adjustment.clock_out)}</span>
                    </div>
                  </div>

                  {canDecide ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openDecision("approve", adjustment)}
                        disabled={isDecisionPending}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => openDecision("reject", adjustment)}
                        disabled={isDecisionPending}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        Rejeitar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open) {
            closeDecision();
          }
        }}
        title={decision?.action === "reject" ? "Rejeitar ajuste de ponto" : "Aceitar ajuste de ponto"}
        description="Confirme a decisão sobre o ajuste de ponto"
        contentClassName="w-[min(92vw,440px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={closeDecision}
              disabled={isDecisionPending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDecision}
              disabled={isDecisionPending}
              className={`rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                decision?.action === "reject"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isDecisionPending ? "Salvando..." : decision?.action === "reject" ? "Rejeitar" : "Aceitar"}
            </button>
          </>
        }
      >
        {decision?.action === "reject" ? (
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>Justificativa (opcional)</span>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={4}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Informe o motivo da rejeição, se desejar"
            />
          </label>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Confirmar a aceitação deste ajuste? O ponto será atualizado.
          </p>
        )}
      </Dialog>
    </div>
  );
}

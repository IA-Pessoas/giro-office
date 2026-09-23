import { useState } from "react";
import { Check, RotateCcw, Send, X } from "lucide-react";
import { toast } from "react-toastify";

import type { ModuleAccess } from "@modules/auth";

import {
  useCancelTaskCompletionMutation,
  useDecideTaskCompletionMutation,
  useIntegracaoTaskCompletionRequests,
  useReopenTaskMutation,
  useRequestTaskCompletionMutation,
} from "../hooks";
import type { IntegracaoTaskDetail } from "../types";
import { PROJECT_COMPACT_BUTTON_CLASSNAME, PROJECT_INPUT_CLASSNAME } from "./projectUi";

interface TaskCompletionPanelProps {
  /** Permissão específica de conclusão; o nível 2 só decide quando a possui. */
  canApproveCompletion: boolean;
  task: Pick<
    IntegracaoTaskDetail,
    | "id"
    | "status"
    | "commercial_validation_pending"
    | "responsible_id"
    | "responsible2_id"
    | "responsible3_id"
  >;
  currentUserId: string | undefined;
  accessLevel: ModuleAccess["level"];
  isOwner: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando decisão",
  approved: "Aprovada",
  refused: "Recusada",
  canceled: "Cancelada",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data;
    return data?.error ?? data?.message ?? fallback;
  }
  return fallback;
}

function formatHistoryDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
}

export function TaskCompletionPanel({
  task,
  currentUserId,
  accessLevel,
  isOwner,
  canApproveCompletion,
}: TaskCompletionPanelProps) {
  const [requestReason, setRequestReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const historyQuery = useIntegracaoTaskCompletionRequests(task.id);
  const requestMutation = useRequestTaskCompletionMutation();
  const decisionMutation = useDecideTaskCompletionMutation();
  const cancelMutation = useCancelTaskCompletionMutation();
  const reopenMutation = useReopenTaskMutation();
  const history = historyQuery.data ?? [];
  const pendingRequest = history.find(({ status }) => status === "pending");
  const isResponsible = [task.responsible_id, task.responsible2_id, task.responsible3_id].includes(
    currentUserId ?? null,
  );
  const canDecide =
    accessLevel === "admin" ||
    isOwner ||
    (accessLevel === "edit" && canApproveCompletion);
  const canReopen = accessLevel === "admin" || isOwner;
  const awaitingCommercialValidation = task.commercial_validation_pending === true;
  const isMutating =
    requestMutation.isPending ||
    decisionMutation.isPending ||
    cancelMutation.isPending ||
    reopenMutation.isPending;

  async function requestCompletion() {
    try {
      await requestMutation.mutateAsync({ taskId: task.id, reason: requestReason.trim() });
      setRequestReason("");
      toast.success("Solicitação de conclusão enviada.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível solicitar a conclusão."));
    }
  }

  async function decideCompletion(decision: "approved" | "refused") {
    if (!pendingRequest) return;
    if (decision === "refused" && !decisionReason.trim()) {
      toast.warning("Informe o motivo da recusa.");
      return;
    }
    try {
      await decisionMutation.mutateAsync({
        taskId: task.id,
        requestId: pendingRequest.id,
        decision,
        ...(decision === "refused" ? { reason: decisionReason.trim() } : {}),
      });
      setDecisionReason("");
      toast.success(decision === "approved" ? "Conclusão aprovada." : "Conclusão recusada.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível decidir a solicitação."));
    }
  }

  async function cancelCompletion() {
    if (!pendingRequest) return;
    try {
      await cancelMutation.mutateAsync({ taskId: task.id, requestId: pendingRequest.id });
      toast.success("Solicitação de conclusão cancelada.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível cancelar a solicitação."));
    }
  }

  async function reopenTask() {
    if (!reopenReason.trim()) {
      toast.warning("Informe o motivo da reabertura.");
      return;
    }
    try {
      await reopenMutation.mutateAsync({ taskId: task.id, reason: reopenReason.trim() });
      setReopenReason("");
      toast.success("Tarefa reaberta.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível reabrir a tarefa."));
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Conclusão</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Solicitações e decisões ficam registradas nesta tarefa.
        </p>
      </div>

      {awaitingCommercialValidation ? (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="status">
          Aguardando validação do Comercial para liberar a execução.
        </p>
      ) : task.status === "Concluída" ? (
        canReopen ? (
          <div className="space-y-2">
            <textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              className={PROJECT_INPUT_CLASSNAME}
              placeholder="Motivo da reabertura"
              aria-label="Motivo da reabertura"
            />
            <button
              type="button"
              onClick={() => void reopenTask()}
              className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              disabled={isMutating}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reabrir tarefa
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Somente administradores podem reabrir uma tarefa concluída.
          </p>
        )
      ) : pendingRequest ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 dark:text-amber-300">Aguardando decisão.</p>
          {pendingRequest.requester_id === currentUserId ? (
            <button
              type="button"
              onClick={() => void cancelCompletion()}
              className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              disabled={isMutating}
            >
              <X className="h-3.5 w-3.5" />
              Cancelar solicitação
            </button>
          ) : null}
          {canDecide ? (
            <div className="space-y-2">
              <textarea
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                className={PROJECT_INPUT_CLASSNAME}
                placeholder="Motivo da recusa, obrigatório ao recusar"
                aria-label="Motivo da recusa"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void decideCompletion("approved")}
                  className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                  disabled={isMutating}
                >
                  <Check className="h-3.5 w-3.5" />
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => void decideCompletion("refused")}
                  className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                  disabled={isMutating}
                >
                  <X className="h-3.5 w-3.5" />
                  Recusar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : isResponsible ? (
        <div className="space-y-2">
          <textarea
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
            className={PROJECT_INPUT_CLASSNAME}
            placeholder="Observação para a conclusão, opcional"
            aria-label="Observação para a solicitação de conclusão"
          />
          <button
            type="button"
            onClick={() => void requestCompletion()}
            className={PROJECT_COMPACT_BUTTON_CLASSNAME}
            disabled={isMutating}
          >
            <Send className="h-3.5 w-3.5" />
            Solicitar conclusão
          </button>
        </div>
      ) : null}

      {historyQuery.isLoading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Carregando histórico...</p>
      ) : historyQuery.isError ? (
        <p className="text-xs text-rose-600 dark:text-rose-300">Não foi possível carregar o histórico.</p>
      ) : history.length > 0 ? (
        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          {history.map((request) => (
            <li key={request.id} className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="font-medium">{STATUS_LABEL[request.status] ?? request.status}</span>
              <span>{formatHistoryDate(request.created_at)}</span>
              {request.reason ? <span>{request.reason}</span> : null}
              {request.decision_reason ? <span>{request.decision_reason}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

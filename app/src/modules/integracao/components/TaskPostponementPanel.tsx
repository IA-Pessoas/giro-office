import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { toast } from "@shared/services/toast";

import type { ModuleAccess } from "@modules/auth";

import { useIntegracaoTaskPostponements, usePostponeTaskMutation } from "../hooks";
import type { IntegracaoTaskDetail } from "../types";
import { PROJECT_COMPACT_BUTTON_CLASSNAME, PROJECT_INPUT_CLASSNAME } from "./projectUi";

interface TaskPostponementPanelProps {
  task: Pick<
    IntegracaoTaskDetail,
    "id" | "status" | "prevision_date" | "responsible_id" | "responsible2_id" | "responsible3_id"
  >;
  currentUserId: string | undefined;
  accessLevel: ModuleAccess["level"];
  isOwner: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const data = (error as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data;
    return data?.error ?? data?.message ?? fallback;
  }
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function isOverdue(value: string | null): boolean {
  return Boolean(value && value.slice(0, 10) < new Date().toISOString().slice(0, 10));
}

export function TaskPostponementPanel({
  task,
  currentUserId,
  accessLevel,
  isOwner,
}: TaskPostponementPanelProps) {
  const [newPrevisionDate, setNewPrevisionDate] = useState("");
  const [justification, setJustification] = useState("");
  const historyQuery = useIntegracaoTaskPostponements(task.id);
  const postponeMutation = usePostponeTaskMutation();
  const isResponsible = [task.responsible_id, task.responsible2_id, task.responsible3_id].includes(
    currentUserId ?? null,
  );
  const canPostpone =
    (isResponsible || accessLevel === "edit" || accessLevel === "admin" || isOwner) &&
    task.status === "Em Andamento" &&
    isOverdue(task.prevision_date);

  async function postponeTask() {
    if (!newPrevisionDate || !justification.trim()) {
      toast.warning("Informe a nova previsão e a justificativa.");
      return;
    }
    try {
      await postponeMutation.mutateAsync({
        taskId: task.id,
        newPrevisionDate,
        justification: justification.trim(),
      });
      setNewPrevisionDate("");
      setJustification("");
      toast.success("Tarefa prorrogada.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível prorrogar a tarefa."));
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Prorrogações</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          A previsão só muda por uma prorrogação justificada, mantendo o histórico completo.
        </p>
      </div>

      {canPostpone ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">
            Nova previsão
            <input
              type="date"
              value={newPrevisionDate}
              onChange={(event) => setNewPrevisionDate(event.target.value)}
              className={`${PROJECT_INPUT_CLASSNAME} mt-1`}
              aria-label="Nova previsão da tarefa"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">
            Justificativa da prorrogação
            <textarea
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              className={`${PROJECT_INPUT_CLASSNAME} mt-1`}
              placeholder="Motivo obrigatório para alterar a previsão"
              aria-label="Justificativa da prorrogação"
              maxLength={2000}
            />
          </label>
          <button
            type="button"
            onClick={() => void postponeTask()}
            className={PROJECT_COMPACT_BUTTON_CLASSNAME}
            disabled={postponeMutation.isPending}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Prorrogar tarefa
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Disponível para responsáveis e administradores quando a tarefa estiver vencida e em andamento.
        </p>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Histórico de prorrogações
        </h4>
        {historyQuery.isLoading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Carregando histórico...</p>
        ) : historyQuery.isError ? (
          <p className="text-xs text-rose-600 dark:text-rose-300">Não foi possível carregar o histórico.</p>
        ) : (historyQuery.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma prorrogação registrada.</p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            {historyQuery.data?.map((postponement) => (
              <li key={postponement.id} className="space-y-1">
                <p>
                  {postponement.previous_prevision_date.slice(0, 10)} para{" "}
                  {postponement.new_prevision_date.slice(0, 10)}
                </p>
                <p>{postponement.justification}</p>
                <p>
                  Autor: {postponement.author_name ?? postponement.author_id} em{" "}
                  {formatDate(postponement.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { departmentService } from "@modules/departments";
import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";

import { integracaoTasksService } from "../services";

interface TaskFinanceiroPanelProps {
  canManage: boolean;
  canView: boolean;
  clientId?: string;
  onSettled?: () => void | Promise<void>;
}

export function TaskFinanceiroPanel({ canManage, canView, clientId, onSettled }: TaskFinanceiroPanelProps) {
  const [departmentId, setDepartmentId] = useState("");
  const [collectorIds, setCollectorIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isSavingCollectors, setIsSavingCollectors] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const departmentsQuery = useFetch(
    ["financeiro-departments"],
    () => departmentService.list({ status: "Ativo" }),
    { enabled: canManage },
  );
  const queueQuery = useFetch(
    ["financeiro-queue", departmentId, clientId],
    () => integracaoTasksService.listFinanceiroQueue({ departmentId: departmentId || undefined, clientId }),
    { enabled: canView },
  );
  const collectorsQuery = useFetch(
    ["financeiro-collectors", departmentId],
    () => integracaoTasksService.listFinanceiroCollectors(departmentId),
    { enabled: canManage && Boolean(departmentId) },
  );
  const usersQuery = useAssignableUsers({
    enabled: canManage && Boolean(departmentId),
    module: "financeiro",
    departmentId: departmentId || undefined,
  });

  useEffect(() => {
    if (!departmentId && departmentsQuery.data?.[0]?.id) {
      setDepartmentId(departmentsQuery.data[0].id);
    }
  }, [departmentId, departmentsQuery.data]);

  useEffect(() => {
    if (collectorsQuery.data) {
      setCollectorIds(collectorsQuery.data);
    }
  }, [collectorsQuery.data]);

  const queue = queueQuery.data ?? [];

  function toggleTask(taskId: string) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  function toggleCollector(userId: string) {
    setCollectorIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function settle(taskIds: string[], express = false) {
    if (taskIds.length === 0) return;
    setIsSettling(true);
    try {
      const key = crypto.randomUUID();
      const result = express && clientId
        ? await integracaoTasksService.settleFinanceiroExpress(clientId, key)
        : await integracaoTasksService.settleFinanceiro(taskIds, key);
      toast.success(`${result.settled} tarefa(s) baixada(s).`);
      setSelectedTaskIds([]);
      await queueQuery.refetch();
      await onSettled?.();
    } catch {
      toast.error("Não foi possível executar a baixa financeira.");
    } finally {
      setIsSettling(false);
    }
  }

  async function settleOne(taskId: string) {
    setIsSettling(true);
    try {
      const result = await integracaoTasksService.updateFinanceiro(taskId, crypto.randomUUID());
      toast.success(`${result.settled} tarefa(s) baixada(s).`);
      setSelectedTaskIds((current) => current.filter((id) => id !== taskId));
      await queueQuery.refetch();
      await onSettled?.();
    } catch {
      toast.error("Não foi possível atualizar a cobrança financeira.");
    } finally {
      setIsSettling(false);
    }
  }

  async function saveCollectors() {
    if (!departmentId) return;
    setIsSavingCollectors(true);
    try {
      await integracaoTasksService.setFinanceiroCollectors(departmentId, collectorIds);
      await collectorsQuery.refetch();
      toast.success("Cobradores atualizados.");
    } catch {
      toast.error("Não foi possível atualizar os cobradores.");
    } finally {
      setIsSavingCollectors(false);
    }
  }

  if (!canView) return null;

  const queueErrorStatus =
    typeof queueQuery.error === "object" && queueQuery.error !== null && "response" in queueQuery.error
      ? (queueQuery.error as { response?: { status?: number } }).response?.status
      : undefined;
  /** 403 aqui significa apenas que o usuário não cobra nenhum departamento. */
  const isOutOfScope = queueErrorStatus === 403;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Fila financeira</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Somente tarefas pendentes dentro do seu escopo.
          </p>
        </div>
        <div className="flex gap-2">
          {clientId ? (
            <button
              type="button"
              onClick={() => void settle(queue.map((task) => task.id), true)}
              disabled={isSettling || queue.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
            >
              Baixa Express do cliente
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void settle(selectedTaskIds)}
            disabled={isSettling || selectedTaskIds.length === 0}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Baixar selecionadas ({selectedTaskIds.length})
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {queueQuery.isLoading ? <p className="text-sm text-slate-500">Carregando fila...</p> : null}
        {queueQuery.isError ? (
          <p className={isOutOfScope ? "text-sm text-slate-500" : "text-sm text-rose-600"}>
            {isOutOfScope
              ? "Você não é cobrador de nenhum departamento, então não há fila para exibir."
              : "Não foi possível carregar a fila."}
          </p>
        ) : null}
        {!queueQuery.isLoading && !queueQuery.isError && queue.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma tarefa financeira pendente.</p>
        ) : null}
        {queue.map((task) => (
          <div key={task.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <input
              type="checkbox"
              aria-label={`Selecionar ${task.name}`}
              checked={selectedTaskIds.includes(task.id)}
              onChange={() => toggleTask(task.id)}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{task.name}</span>
            <span className="text-xs text-slate-500">{task.status}</span>
            <button
              type="button"
              onClick={() => void settleOne(task.id)}
              disabled={isSettling}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-slate-700"
            >
              Baixar
            </button>
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
          <h3 className="font-medium text-slate-900 dark:text-white">Cobradores por departamento</h3>
          <select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            disabled={departmentsQuery.isLoading}
          >
            <option value="">
              {departmentsQuery.isLoading ? "Carregando departamentos..." : "Selecione o departamento"}
            </option>
            {(departmentsQuery.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          {departmentId && usersQuery.isLoading ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400" role="status">
              Carregando usuários...
            </p>
          ) : null}
          {departmentId && !usersQuery.isLoading && (usersQuery.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Nenhum usuário ativo neste departamento.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(usersQuery.data ?? []).map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={collectorIds.includes(user.id)} onChange={() => toggleCollector(user.id)} />
                {user.name}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void saveCollectors()} disabled={!departmentId || isSavingCollectors} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700">
            Salvar cobradores
          </button>
        </div>
      ) : null}
    </section>
  );
}

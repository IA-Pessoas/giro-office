import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Edit3,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";

import { useMe } from "@shared/hooks";

import { INTEGRACAO_TASK_STATUS_VALUES, type IntegracaoTaskListItem } from "../types";
import {
  useDeleteIntegracaoTaskMutation,
  useIntegracaoTasksList,
} from "../hooks";
import {
  TASK_MODEL_CONFIG_ENTRY,
  canManageTaskModelConfig,
} from "../navigation/taskModelConfigNavigation";
import { TaskFormModal } from "./TaskFormModal";
import {
  getProjectStatusTone,
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SELECT_ARROW_STYLE,
  PROJECT_SELECT_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
} from "./projectUi";
import {
  TASK_TABLE_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_ACTION_CELL_CLASSNAME,
  TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME,
  TASK_TABLE_BADGE_CLASSNAME,
  TASK_TABLE_CELL_CLASSNAME,
  TASK_TABLE_CLASSNAME,
  TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_HEAD_CELL_CLASSNAME,
  TASK_TABLE_SCROLL_AREA_CLASSNAME,
  formatTasksFooterSummary,
} from "./taskWorkspaceUi";

const TASKS_PAGE_SIZE = 20;

const TASK_REF_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "CobrançaComercial", label: "Cobrança comercial" },
  { value: "CobrançaFinanceiro", label: "Cobrança financeiro" },
] as const;

function formatNullable(value: string | null | undefined) {
  return value?.trim() ? value : "Não informado";
}

function formatBoolean(value: boolean) {
  return value ? "Sim" : "Não";
}

function getBooleanTone(value: boolean) {
  return value
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function getBillingTone(value: string) {
  return value.toLowerCase().includes("não")
    ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
    : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
}

function mergeTaskPages(currentTasks: IntegracaoTaskListItem[], nextTasks: IntegracaoTaskListItem[]) {
  const taskById = new Map(currentTasks.map((task) => [task.id, task]));

  nextTasks.forEach((task) => {
    taskById.set(task.id, task);
  });

  return Array.from(taskById.values());
}

export function TasksWorkspace() {
  const meQuery = useMe();
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [refFilter, setRefFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [visibleTasks, setVisibleTasks] = useState<IntegracaoTaskListItem[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      status: statusFilter,
      ref: refFilter,
      search: searchTerm.trim(),
      page,
      limit: TASKS_PAGE_SIZE,
    }),
    [page, refFilter, searchTerm, statusFilter],
  );

  const tasksQuery = useIntegracaoTasksList(listParams);
  const deleteTaskMutation = useDeleteIntegracaoTaskMutation();
  const canDelete = meQuery.data?.permission === 2;
  const canManageTaskModels = canManageTaskModelConfig(meQuery.data?.permission);

  useEffect(() => {
    setPage(1);
    setVisibleTasks([]);
  }, [refFilter, searchTerm, statusFilter]);

  useEffect(() => {
    if (!tasksQuery.data) {
      return;
    }

    setVisibleTasks((currentTasks) =>
      page === 1 ? tasksQuery.data.data : mergeTaskPages(currentTasks, tasksQuery.data.data),
    );
  }, [page, tasksQuery.data]);

  const stats = useMemo(
    () => [
      {
        label: "Tarefas",
        value: visibleTasks.length,
        description: "Registros carregados com os filtros atuais.",
      },
      {
        label: "Em andamento",
        value: visibleTasks.filter((task) => task.status.toLowerCase().includes("andamento")).length,
        description: "Tarefas ativas na página carregada.",
      },
      {
        label: "Com cobrança",
        value: visibleTasks.filter((task) => !task.billing.toLowerCase().includes("não")).length,
        description: "Itens marcados para realizar cobrança.",
      },
    ],
    [visibleTasks],
  );

  async function handleDelete(task: IntegracaoTaskListItem) {
    if (!canDelete) {
      toast.error("Somente usuários com permissão 2 podem excluir tarefas.");
      return;
    }

    if (!window.confirm(`Excluir a tarefa "${task.name}"?`)) {
      return;
    }

    try {
      await deleteTaskMutation.mutateAsync({ taskId: task.id });
      setVisibleTasks((currentTasks) => currentTasks.filter((currentTask) => currentTask.id !== task.id));
      toast.success("Tarefa excluída com sucesso.");
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { status?: number } }).response?.status === "number"
          ? (error as { response?: { status?: number } }).response?.status
          : null;

      if (statusCode === 403) {
        toast.error("Somente usuários com permissão 2 podem excluir tarefas.");
        return;
      }

      toast.error("Não foi possível excluir a tarefa.");
    }
  }

  function handleRefetch() {
    void tasksQuery.refetch();
  }

  function handleTaskSaved() {
    setPage(1);
    setVisibleTasks([]);
    void tasksQuery.refetch();
  }

  const isInitialLoading = tasksQuery.isLoading && visibleTasks.length === 0;
  const hasMore = Boolean(tasksQuery.data?.hasMore);

  return (
    <div className="space-y-6">
      <TaskFormModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleTaskSaved}
      />

      <TaskFormModal
        open={Boolean(editingTaskId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTaskId(null);
          }
        }}
        taskId={editingTaskId}
        onSuccess={handleTaskSaved}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20">
              <CheckSquare className="h-6 w-6 text-white" />
            </div>
            Tarefas
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Acompanhe tarefas reais da integração, com filtros alinhados ao task-service.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {canManageTaskModels ? (
            <Link href={TASK_MODEL_CONFIG_ENTRY.href} className={PROJECT_COMPACT_BUTTON_CLASSNAME}>
              <Settings2 className="h-3.5 w-3.5" />
              {TASK_MODEL_CONFIG_ENTRY.label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleRefetch}
            className={PROJECT_COMPACT_BUTTON_CLASSNAME}
            disabled={tasksQuery.isFetching}
          >
            {tasksQuery.isFetching ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
          >
            <Plus className="h-4 w-4" />
            Nova tarefa
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <section key={stat.label} className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">{stat.value}</p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{stat.description}</p>
          </section>
        ))}
      </div>

      <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_260px]">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white">
              <Search className="h-4 w-4 text-slate-400" />
              Buscar tarefa
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={PROJECT_INPUT_CLASSNAME}
              placeholder="Buscar por nome"
            />
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white">
              <Filter className="h-4 w-4 text-slate-400" />
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={PROJECT_SELECT_CLASSNAME}
              style={PROJECT_SELECT_ARROW_STYLE}
            >
              <option value="Todos">Todos</option>
              {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white">
              <Filter className="h-4 w-4 text-slate-400" />
              Origem
            </span>
            <select
              value={refFilter}
              onChange={(event) => setRefFilter(event.target.value)}
              className={PROJECT_SELECT_CLASSNAME}
              style={PROJECT_SELECT_ARROW_STYLE}
            >
              {TASK_REF_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={`${PROJECT_PANEL_CLASSNAME} overflow-hidden`}>
        <div className={TASK_TABLE_SCROLL_AREA_CLASSNAME}>
          <table className={TASK_TABLE_CLASSNAME}>
            <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
              <tr className="text-left">
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-40`}>Tarefa</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-28`}>Status</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-28`}>Cobrança</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-24`}>Comercial</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-24`}>Financeiro</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-32`}>Contratação</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-32`}>Pagamento</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-40`}>Descrição</th>
                <th className={TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                <tr>
                  <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={9}>
                    <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                    Carregando tarefas...
                  </td>
                </tr>
              ) : tasksQuery.isError ? (
                <tr>
                  <td className="px-5 py-10 text-sm text-rose-600 dark:text-rose-300" colSpan={9}>
                    Não foi possível carregar as tarefas no momento.
                  </td>
                </tr>
              ) : visibleTasks.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={9}>
                    Nenhuma tarefa encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                visibleTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                  >
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <p className="line-clamp-2 font-semibold text-slate-900 dark:text-white" title={task.name}>
                        {task.name}
                      </p>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <span
                        className={`${TASK_TABLE_BADGE_CLASSNAME} ${getProjectStatusTone(
                          task.status,
                        )}`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <span
                        className={`${TASK_TABLE_BADGE_CLASSNAME} ${getBillingTone(
                          task.billing,
                        )}`}
                      >
                        {task.billing}
                      </span>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <span
                        className={`${TASK_TABLE_BADGE_CLASSNAME} ${getBooleanTone(
                          task.charge_comercial,
                        )}`}
                      >
                        {formatBoolean(task.charge_comercial)}
                      </span>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <span
                        className={`${TASK_TABLE_BADGE_CLASSNAME} ${getBooleanTone(
                          task.charge_financeiro,
                        )}`}
                      >
                        {formatBoolean(task.charge_financeiro)}
                      </span>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      {formatNullable(task.hiring_status)}
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      {formatNullable(task.payment)}
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <p className="line-clamp-3" title={formatNullable(task.billing_description)}>
                        {formatNullable(task.billing_description)}
                      </p>
                    </td>
                    <td className={TASK_TABLE_ACTION_CELL_CLASSNAME}>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(task.id)}
                          className={TASK_TABLE_ACTION_BUTTON_CLASSNAME}
                          disabled={deleteTaskMutation.isPending}
                          aria-label={`Editar tarefa ${task.name}`}
                          title="Editar tarefa"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>

                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(task)}
                            className={TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME}
                            disabled={deleteTaskMutation.isPending}
                            aria-label={`Excluir tarefa ${task.name}`}
                            title="Excluir tarefa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatTasksFooterSummary({ page, count: visibleTasks.length })}
          </p>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              disabled={tasksQuery.isFetching}
            >
              {tasksQuery.isFetching ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Carregar mais
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

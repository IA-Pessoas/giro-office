import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
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

import { useModuleAccess } from "@modules/auth";
import { ClientPickerModal, type ClientPickerOption, useClient } from "@modules/clients";
import { ConfirmationDialog, PaginationControls } from "@shared/components";
import { useDebouncedValue } from "@shared/hooks";

import { INTEGRACAO_TASK_STATUS_VALUES, type IntegracaoTaskListItem } from "../types";
import { useDeleteIntegracaoTaskMutation, useIntegracaoTasksList } from "../hooks";
import { TASK_MODEL_CONFIG_ENTRY } from "../navigation/taskModelConfigNavigation";
import { TaskFormModal } from "./TaskFormModal";
import { TaskFinanceiroPanel } from "./TaskFinanceiroPanel";
import {
  getProjectStatusTone,
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
  ProjectSelect,
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
  TASK_TABLE_NAME_CELL_CLASSNAME,
  TASK_TABLE_NAME_HEAD_CELL_CLASSNAME,
  TASK_TABLE_SCROLL_AREA_CLASSNAME,
  canEditIntegracaoTask,
} from "./taskWorkspaceUi";

const TASKS_PAGE_SIZE = 20;

const TASK_REF_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "CobrançaComercial", label: "Cobrança comercial" },
  { value: "CobrançaFinanceiro", label: "Cobrança financeiro" },
] as const;

function formatNullable(value: string | null | undefined) {
  return value?.trim() ? value : "—";
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

export function TasksWorkspace() {
  const router = useRouter();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [refFilter, setRefFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">(
    "all",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState<IntegracaoTaskListItem | null>(null);
  const [taskDeletionError, setTaskDeletionError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const isSearchPending = searchTerm.trim() !== debouncedSearch;
  const routeClientIds = new URLSearchParams(router.asPath.split("?", 2)[1]?.split("#", 1)[0]).getAll(
    "clientId",
  );
  const routeClientId = routeClientIds.length > 0 ? routeClientIds.join(",") : undefined;
  const clientQuery = useClient(routeClientId);
  const client = clientQuery.data;
  const selectedClient =
    client && client.id === routeClientId
      ? {
          id: client.id,
          name: client.company_name || client.name,
          document: client.cpf_cnpj,
        }
      : null;

  const listParams = useMemo(
    () => ({
      status: statusFilter,
      ref: refFilter,
      search: debouncedSearch,
      clientId: routeClientId,
      assignment: assignmentFilter === "all" ? undefined : assignmentFilter,
      page,
      limit: TASKS_PAGE_SIZE,
    }),
    [assignmentFilter, debouncedSearch, page, refFilter, routeClientId, statusFilter],
  );

  const tasksQuery = useIntegracaoTasksList(listParams, { enabled: router.isReady });
  const deleteTaskMutation = useDeleteIntegracaoTaskMutation();
  const canDelete = integracaoAccess.isAdmin;
  const canCreate = integracaoAccess.canEdit;
  const canManageTaskModels = integracaoAccess.isAdmin;
  const tasks = tasksQuery.data?.data ?? [];
  const total = tasksQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [assignmentFilter, refFilter, routeClientId, searchTerm, statusFilter]);

  const stats = useMemo(
    () => [
      {
        label: "Tarefas",
        value: tasksQuery.data?.total ?? 0,
        description: "Todos os registros com os filtros atuais.",
      },
      {
        label: "Em andamento",
        value: tasksQuery.data?.summary.inProgress ?? 0,
        description: "Tarefas ativas em todo o resultado filtrado.",
      },
      {
        label: "Com cobrança",
        value: tasksQuery.data?.summary.billable ?? 0,
        description: "Itens com cobrança em todo o resultado filtrado.",
      },
    ],
    [tasksQuery.data],
  );

  function handleDelete(task: IntegracaoTaskListItem) {
    if (!canDelete) {
      toast.error("Somente usuários com permissão administrativa na Integração podem excluir tarefas.");
      return;
    }

    setTaskDeletionError(null);
    setPendingTaskDeletion(task);
  }

  async function handleConfirmTaskDeletion() {
    const task = pendingTaskDeletion;

    if (!task) {
      return;
    }

    try {
      await deleteTaskMutation.mutateAsync({ taskId: task.id });
      void tasksQuery.refetch();
      toast.success("Tarefa excluída com sucesso.");
      setPendingTaskDeletion(null);
      setTaskDeletionError(null);
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { status?: number } }).response?.status === "number"
          ? (error as { response?: { status?: number } }).response?.status
          : null;

      if (statusCode === 403) {
        const message = "Somente usuários com permissão administrativa na Integração podem excluir tarefas.";
        toast.error(message);
        setTaskDeletionError(message);
        throw error;
      }

      const message = "Não foi possível excluir a tarefa.";
      toast.error(message);
      setTaskDeletionError(message);
      throw error;
    }
  }

  function handleRefetch() {
    void tasksQuery.refetch();
  }

  function handleTaskSaved() {
    setPage(1);
    void tasksQuery.refetch();
  }

  function handleClientSelect(client: ClientPickerOption | null) {
    setPage(1);
    void router.replace(
      { pathname: "/tasks", query: client ? { clientId: client.id } : {} },
      undefined,
      { shallow: true },
    );
  }

  const isInitialLoading = tasksQuery.isLoading && tasks.length === 0;
  const hasMore = Boolean(tasksQuery.data?.hasMore) && page < totalPages;

  return (
    <div className="space-y-6">
      <ConfirmationDialog
        open={Boolean(pendingTaskDeletion)}
        onOpenChange={(open) => {
          if (!open && !deleteTaskMutation.isPending) {
            setPendingTaskDeletion(null);
            setTaskDeletionError(null);
          }
        }}
        title={`Excluir tarefa "${pendingTaskDeletion?.name ?? ""}"?`}
        description="Esta ação remove a tarefa e não pode ser desfeita."
        onConfirm={handleConfirmTaskDeletion}
        isConfirming={deleteTaskMutation.isPending}
        errorMessage={taskDeletionError}
        confirmLabel="Excluir tarefa"
        cancelLabel="Cancelar"
        variant="destructive"
      />

      {canCreate ? (
        <TaskFormModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          onSuccess={handleTaskSaved}
          selectedClient={selectedClient}
          integracaoAccess={integracaoAccess}
        />
      ) : null}

      <TaskFormModal
        open={Boolean(editingTaskId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTaskId(null);
          }
        }}
        taskId={editingTaskId}
        onSuccess={handleTaskSaved}
        selectedClient={selectedClient}
        integracaoAccess={integracaoAccess}
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

        <div className="flex flex-col gap-2 sm:items-end">
          <ClientPickerModal
            selectedClient={selectedClient}
            onSelectClient={handleClientSelect}
            filters={{}}
            allowClearSelection
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {canManageTaskModels ? (
              <Link
                href={TASK_MODEL_CONFIG_ENTRY.href}
                className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              >
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
            {canCreate ? (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={!selectedClient}
                title={
                  !selectedClient ? "Selecione um cliente antes de criar uma tarefa." : undefined
                }
              >
                <Plus className="h-4 w-4" />
                Nova tarefa
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <section key={stat.label} className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
              {stat.value}
            </p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{stat.description}</p>
          </section>
        ))}
      </div>

      <TaskFinanceiroPanel
        canManage={integracaoAccess.isAdmin}
        canView={integracaoAccess.canView}
        clientId={routeClientId}
      />

      <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_240px]">
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
              Atribuição
            </span>
            <ProjectSelect
              value={assignmentFilter}
              onChange={(event) =>
                setAssignmentFilter(event.target.value as typeof assignmentFilter)
              }
            >
              <option value="all">Todas</option>
              <option value="assigned">Com responsável</option>
              <option value="unassigned">Sem responsável</option>
            </ProjectSelect>
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white">
              <Filter className="h-4 w-4 text-slate-400" />
              Status
            </span>
            <ProjectSelect
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="Todos">Todos</option>
              {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </ProjectSelect>
          </label>

          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white">
              <Filter className="h-4 w-4 text-slate-400" />
              Origem
            </span>
            <ProjectSelect
              value={refFilter}
              onChange={(event) => setRefFilter(event.target.value)}
            >
              {TASK_REF_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ProjectSelect>
          </label>
        </div>
      </section>

      <section className={`${PROJECT_PANEL_CLASSNAME} overflow-hidden`}>
        <div className={TASK_TABLE_SCROLL_AREA_CLASSNAME}>
          <table className={TASK_TABLE_CLASSNAME}>
            <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
              <tr className="text-left">
                <th className={TASK_TABLE_NAME_HEAD_CELL_CLASSNAME}>Tarefa</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-28`}>Status</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-28`}>Cobrança</th>
                <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} w-36`}>Responsável</th>
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
                  <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={10}>
                    <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                    Carregando tarefas...
                  </td>
                </tr>
              ) : tasksQuery.isError ? (
                <tr>
                  <td className="px-5 py-10 text-sm text-rose-600 dark:text-rose-300" colSpan={10}>
                    Não foi possível carregar as tarefas no momento.
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={10}>
                    Nenhuma tarefa encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                  >
                    <td className={TASK_TABLE_NAME_CELL_CLASSNAME}>
                      <p
                        className="line-clamp-2 font-semibold text-slate-900 dark:text-white"
                        title={task.name}
                      >
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
                        className={`${TASK_TABLE_BADGE_CLASSNAME} ${getBillingTone(task.billing)}`}
                      >
                        {task.billing}
                      </span>
                    </td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      {task.isUnassigned ? "Sem responsável" : "Com responsável"}
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
                    <td className={TASK_TABLE_CELL_CLASSNAME}>{formatNullable(task.payment)}</td>
                    <td className={TASK_TABLE_CELL_CLASSNAME}>
                      <p className="line-clamp-3" title={formatNullable(task.billing_description)}>
                        {formatNullable(task.billing_description)}
                      </p>
                    </td>
                    <td className={TASK_TABLE_ACTION_CELL_CLASSNAME}>
                      <div className="flex justify-center gap-2">
                        {canEditIntegracaoTask(integracaoAccess, task) ? (
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
                        ) : null}

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

        <PaginationControls
          page={page}
          limit={TASKS_PAGE_SIZE}
          total={total}
          count={tasks.length}
          hasMore={hasMore}
          isFetching={tasksQuery.isFetching || isSearchPending}
          totalPages={totalPages}
          onFirst={() => setPage(1)}
          onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          onPageChange={setPage}
          onNext={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
          onLast={() => setPage(totalPages)}
        />
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { CalendarDays, FileText, LoaderCircle, Save } from "lucide-react";
import { toast } from "react-toastify";

import { ClientSelectionField, type ClientPickerOption } from "@modules/clients";
import { departmentService, type DepItem } from "@modules/departments";
import { listAdminUsers, type UserItem } from "@modules/users";
import { Dialog } from "@shared/components/ui/Dialog";
import { useFetch } from "@shared/hooks";

import {
  INTEGRACAO_TASK_STATUS_VALUES,
  PROSPECTING_STATUS_VALUES,
  type IntegracaoTaskDetail,
  type IntegracaoTaskStatus,
  type ProspectingStatus,
  type TaskBilling,
} from "../types";
import { taskModelService } from "../services";
import {
  useCreateIntegracaoTaskMutation,
  useIntegracaoTaskDetail,
  useProjectsList,
  useUpdateIntegracaoTaskMutation,
} from "../hooks";
import {
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SECONDARY_BUTTON_CLASSNAME,
  PROJECT_SELECT_ARROW_STYLE,
  PROJECT_SELECT_CLASSNAME,
} from "./projectUi";
import {
  TASK_FORM_AUXILIARY_WARNING_CLASSNAME,
  TASK_FORM_BODY_CLASSNAME,
  TASK_FORM_CONTENT_CLASSNAME,
  TASK_FORM_FORM_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_LABEL_CLASSNAME,
  TASK_FORM_TEXTAREA_CLASSNAME,
  TASK_FORM_THREE_COLUMN_GRID_CLASSNAME,
  TASK_URGENCY_OPTIONS,
  type TaskUrgencyOption,
  getDefaultTaskUrgency,
  getProjectSelectPlaceholder,
  getTaskCreateValidationMessage,
  getTaskUrgencyOptions,
  shouldBlockTaskEditForm,
} from "./taskFormModalUi";

interface TaskFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string | null;
  onSuccess?: (task: IntegracaoTaskDetail) => void;
  selectedClient: ClientPickerOption | null;
}

interface CreateFormState {
  client_id: string;
  project_id: string;
  model_id: string;
  prospecting_status: ProspectingStatus;
  name: string;
  status: IntegracaoTaskStatus | "";
  department_id: string;
  observations: string;
  billing: TaskBilling | "";
  urgency: TaskUrgencyOption;
  responsible_id: string;
  responsible2_id: string;
  responsible3_id: string;
  prevision_date: string;
}

interface EditFormState {
  name: string;
  status: IntegracaoTaskStatus | "";
  department_id: string;
  observations: string;
  billing: TaskBilling;
  urgency: string;
  responsible_id: string;
  responsible2_id: string;
  responsible3_id: string;
  prevision_date: string;
}

const CREATE_INITIAL_STATE: CreateFormState = {
  client_id: "",
  project_id: "",
  model_id: "",
  prospecting_status: PROSPECTING_STATUS_VALUES[0],
  name: "",
  status: "",
  department_id: "",
  observations: "",
  billing: "",
  urgency: getDefaultTaskUrgency(),
  responsible_id: "",
  responsible2_id: "",
  responsible3_id: "",
  prevision_date: "",
};

const EDIT_INITIAL_STATE: EditFormState = {
  name: "",
  status: "",
  department_id: "",
  observations: "",
  billing: "Não Realizar",
  urgency: "",
  responsible_id: "",
  responsible2_id: "",
  responsible3_id: "",
  prevision_date: "",
};

const TASK_BILLING_OPTIONS: TaskBilling[] = ["Realizar", "Não Realizar"];

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { error?: string; message?: string } } }).response?.data
      ?.error === "string"
  ) {
    return (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
      "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
  }

  return fallback;
}

export function TaskFormModal({
  open,
  onOpenChange,
  taskId,
  onSuccess,
  selectedClient,
}: TaskFormModalProps) {
  const isEditing = Boolean(taskId);
  const [createValues, setCreateValues] = useState<CreateFormState>(CREATE_INITIAL_STATE);
  const [editValues, setEditValues] = useState<EditFormState>(EDIT_INITIAL_STATE);
  const projectsQuery = useProjectsList(
    !isEditing && createValues.client_id ? { ref: "client", id: createValues.client_id } : null,
  );
  const taskModelsQuery = useFetch(
    ["task-form-task-models"],
    () => taskModelService.list({ type: "Projeto" }),
    {
      enabled: open && !isEditing,
    },
  );
  const departmentsQuery = useFetch<DepItem[]>(
    ["task-form-departments"],
    () => departmentService.list({ status: "Ativo" }),
    {
      enabled: open,
    },
  );
  const usersQuery = useFetch<UserItem[]>(
    ["task-form-users"],
    () => listAdminUsers("active"),
    {
      enabled: open,
    },
  );
  const taskDetailQuery = useIntegracaoTaskDetail(open && taskId ? taskId : undefined);
  const createMutation = useCreateIntegracaoTaskMutation();
  const updateMutation = useUpdateIntegracaoTaskMutation();

  useEffect(() => {
    if (!open) {
      setCreateValues(CREATE_INITIAL_STATE);
      setEditValues(EDIT_INITIAL_STATE);
      return;
    }

    if (!isEditing) {
      setCreateValues({ ...CREATE_INITIAL_STATE, client_id: selectedClient?.id ?? "" });
    }
  }, [isEditing, open, selectedClient?.id]);

  useEffect(() => {
    if (!open || !taskDetailQuery.data) {
      return;
    }

    const detail = taskDetailQuery.data;
    setEditValues({
      name: detail.name ?? "",
      status: INTEGRACAO_TASK_STATUS_VALUES.includes(detail.status as IntegracaoTaskStatus)
        ? (detail.status as IntegracaoTaskStatus)
        : "",
      department_id: detail.department_id ?? "",
      observations: detail.observations ?? "",
      billing: TASK_BILLING_OPTIONS.includes(detail.billing as TaskBilling)
        ? (detail.billing as TaskBilling)
        : "Não Realizar",
      urgency: detail.urgency ?? "",
      responsible_id: detail.responsible_id ?? "",
      responsible2_id: detail.responsible2_id ?? "",
      responsible3_id: detail.responsible3_id ?? "",
      prevision_date: toDateInputValue(detail.prevision_date),
    });
  }, [open, taskDetailQuery.data]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoadingEditTask =
    isEditing &&
    shouldBlockTaskEditForm({
      isTaskLoading: taskDetailQuery.isLoading,
      isDepartmentsLoading: departmentsQuery.isLoading,
      isUsersLoading: usersQuery.isLoading,
    });
  const hasEditAuxiliaryOptionsWarning =
    isEditing && (departmentsQuery.isError || usersQuery.isError);
  const departments = departmentsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const shouldRenderCurrentDepartmentOption =
    Boolean(editValues.department_id) &&
    !departments.some((department) => department.id === editValues.department_id);
  const createProjectsCount = projectsQuery.data?.length ?? null;
  const hasNoProjectsForSelectedClient =
    Boolean(createValues.client_id) && !projectsQuery.isLoading && createProjectsCount === 0;
  const projectSelectPlaceholder = getProjectSelectPlaceholder({
    hasClient: Boolean(createValues.client_id),
    isLoading: projectsQuery.isLoading,
    projectCount: createProjectsCount,
  });
  const editUrgencyOptions = getTaskUrgencyOptions(editValues.urgency);

  function shouldRenderCurrentUserOption(userId: string) {
    return Boolean(userId) && !users.some((user) => user.id === userId);
  }

  function getDepartmentPlaceholder() {
    if (departmentsQuery.isLoading) {
      return "Carregando departamentos...";
    }

    if (departmentsQuery.isError) {
      return "Departamentos indisponíveis";
    }

    return "Selecione";
  }

  function getUserPlaceholder(optional: boolean) {
    if (usersQuery.isLoading) {
      return "Carregando usuários...";
    }

    if (usersQuery.isError) {
      return "Usuários indisponíveis";
    }

    return optional ? "Opcional" : "Selecione";
  }

  function updateCreateValue<Key extends keyof CreateFormState>(
    field: Key,
    value: CreateFormState[Key],
  ) {
    setCreateValues((currentValues) => ({
      ...currentValues,
      [field]: value,
      ...(field === "client_id" ? { project_id: "" } : {}),
    }));
  }

  function updateEditValue<Key extends keyof EditFormState>(field: Key, value: EditFormState[Key]) {
    setEditValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
  }

  async function handleCreateSubmit() {
    const validationMessage = getTaskCreateValidationMessage({
      clientId: createValues.client_id,
      projectId: createValues.project_id,
      modelId: createValues.model_id,
      prospectingStatus: createValues.prospecting_status,
      urgency: createValues.urgency,
      observations: createValues.observations,
    });

    if (validationMessage) {
      toast.warning(validationMessage);
      return;
    }

    try {
      const createdTask = await createMutation.mutateAsync({
        model_id: createValues.model_id,
        project_id: createValues.project_id,
        client_id: createValues.client_id,
        prospecting_status: createValues.prospecting_status,
        name: createValues.name.trim() || undefined,
        status: createValues.status || undefined,
        department_id: createValues.department_id || undefined,
        observations: createValues.observations.trim(),
        billing: createValues.billing || undefined,
        urgency: createValues.urgency,
        responsible_id: createValues.responsible_id || undefined,
        responsible2_id: createValues.responsible2_id || undefined,
        responsible3_id: createValues.responsible3_id || undefined,
        prevision_date: createValues.prevision_date || undefined,
      });

      toast.success("Tarefa criada com sucesso.");
      onSuccess?.(createdTask);
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Não foi possível criar a tarefa."));
    }
  }

  async function handleEditSubmit() {
    if (!taskId) {
      return;
    }

    if (
      !editValues.name.trim() ||
      !editValues.status ||
      !editValues.department_id ||
      !editValues.responsible_id ||
      !editValues.urgency.trim()
    ) {
      toast.warning("Preencha nome, status, departamento, responsável e urgência.");
      return;
    }

    try {
      const updatedTask = await updateMutation.mutateAsync({
        task_id: taskId,
        name: editValues.name.trim(),
        status: editValues.status,
        department_id: editValues.department_id,
        observations: editValues.observations.trim(),
        billing: editValues.billing,
        urgency: editValues.urgency.trim(),
        responsible_id: editValues.responsible_id,
        responsible2_id: editValues.responsible2_id || null,
        responsible3_id: editValues.responsible3_id || null,
        prevision_date: editValues.prevision_date || null,
      });

      toast.success("Tarefa atualizada com sucesso.");
      onSuccess?.(updatedTask);
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Não foi possível atualizar a tarefa."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar tarefa" : "Nova tarefa"}
      description="Formulário de tarefa de integração"
      contentClassName={TASK_FORM_CONTENT_CLASSNAME}
      bodyClassName={TASK_FORM_BODY_CLASSNAME}
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                void handleEditSubmit();
                return;
              }

              void handleCreateSubmit();
            }}
            className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
            disabled={isSaving || isLoadingEditTask}
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? "Salvar alterações" : "Criar tarefa"}
          </button>
        </>
      }
    >
      {isEditing && isLoadingEditTask ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Carregando tarefa...
        </div>
      ) : isEditing && taskDetailQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          Não foi possível carregar a tarefa para edição.
        </div>
      ) : isEditing ? (
        <form
          className={TASK_FORM_FORM_CLASSNAME}
          onSubmit={(event) => {
            event.preventDefault();
            void handleEditSubmit();
          }}
        >
          {hasEditAuxiliaryOptionsWarning ? (
            <div className={TASK_FORM_AUXILIARY_WARNING_CLASSNAME}>
              Algumas listas de seleção não carregaram. Os dados atuais continuam no formulário.
            </div>
          ) : null}

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Nome</span>
              <input
                type="text"
                value={editValues.name}
                onChange={(event) => updateEditValue("name", event.target.value)}
                className={PROJECT_INPUT_CLASSNAME}
              />
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
              <select
                value={editValues.status}
                onChange={(event) =>
                  updateEditValue("status", event.target.value as IntegracaoTaskStatus | "")
                }
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
              >
                <option value="">Selecione</option>
                {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Departamento
              </span>
              <select
                value={editValues.department_id}
                onChange={(event) => updateEditValue("department_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={departmentsQuery.isLoading || departmentsQuery.isError}
              >
                <option value="">{getDepartmentPlaceholder()}</option>
                {shouldRenderCurrentDepartmentOption ? (
                  <option value={editValues.department_id}>Departamento atual</option>
                ) : null}
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cobrança</span>
              <select
                value={editValues.billing}
                onChange={(event) => updateEditValue("billing", event.target.value as TaskBilling)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
              >
                {TASK_BILLING_OPTIONS.map((billing) => (
                  <option key={billing} value={billing}>
                    {billing}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={TASK_FORM_THREE_COLUMN_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Responsável
              </span>
              <select
                value={editValues.responsible_id}
                onChange={(event) => updateEditValue("responsible_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={usersQuery.isLoading || usersQuery.isError}
              >
                <option value="">{getUserPlaceholder(false)}</option>
                {shouldRenderCurrentUserOption(editValues.responsible_id) ? (
                  <option value={editValues.responsible_id}>Responsável atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Responsável 2
              </span>
              <select
                value={editValues.responsible2_id}
                onChange={(event) => updateEditValue("responsible2_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={usersQuery.isLoading || usersQuery.isError}
              >
                <option value="">{getUserPlaceholder(true)}</option>
                {shouldRenderCurrentUserOption(editValues.responsible2_id) ? (
                  <option value={editValues.responsible2_id}>Responsável 2 atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Responsável 3
              </span>
              <select
                value={editValues.responsible3_id}
                onChange={(event) => updateEditValue("responsible3_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={usersQuery.isLoading || usersQuery.isError}
              >
                <option value="">{getUserPlaceholder(true)}</option>
                {shouldRenderCurrentUserOption(editValues.responsible3_id) ? (
                  <option value={editValues.responsible3_id}>Responsável 3 atual</option>
                ) : null}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Previsão</span>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={editValues.prevision_date}
                  onChange={(event) => updateEditValue("prevision_date", event.target.value)}
                  className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                />
              </div>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Urgência</span>
              <select
                value={editValues.urgency}
                onChange={(event) => updateEditValue("urgency", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
              >
                <option value="">Selecione</option>
                {editUrgencyOptions.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    {urgency}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={TASK_FORM_LABEL_CLASSNAME}>
            <span className="text-sm font-medium text-slate-700 dark:text-white">Observações</span>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <textarea
                value={editValues.observations}
                onChange={(event) => updateEditValue("observations", event.target.value)}
                className={`${PROJECT_INPUT_CLASSNAME} ${TASK_FORM_TEXTAREA_CLASSNAME}`}
                placeholder="Notas operacionais da tarefa."
              />
            </div>
          </label>
        </form>
      ) : (
        <form
          className={TASK_FORM_FORM_CLASSNAME}
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateSubmit();
          }}
        >
          <div className={TASK_FORM_GRID_CLASSNAME}>
            <div className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cliente</span>
              <ClientSelectionField client={selectedClient} clientId={createValues.client_id} />
            </div>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Projeto</span>
              <select
                value={createValues.project_id}
                onChange={(event) => updateCreateValue("project_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={
                  !createValues.client_id || projectsQuery.isLoading || hasNoProjectsForSelectedClient
                }
              >
                <option value="">{projectSelectPlaceholder}</option>
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={TASK_FORM_THREE_COLUMN_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Modelo de tarefa
              </span>
              <select
                value={createValues.model_id}
                onChange={(event) => updateCreateValue("model_id", event.target.value)}
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
                disabled={taskModelsQuery.isLoading}
              >
                <option value="">Selecione um modelo de tarefa</option>
                {(taskModelsQuery.data ?? []).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Status de prospecção
              </span>
              <select
                value={createValues.prospecting_status}
                onChange={(event) =>
                  updateCreateValue("prospecting_status", event.target.value as ProspectingStatus)
                }
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
              >
                {PROSPECTING_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Urgência</span>
              <select
                value={createValues.urgency}
                onChange={(event) =>
                  updateCreateValue("urgency", event.target.value as TaskUrgencyOption)
                }
                className={PROJECT_SELECT_CLASSNAME}
                style={PROJECT_SELECT_ARROW_STYLE}
              >
                {TASK_URGENCY_OPTIONS.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    {urgency}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Nome</span>
              <input value={createValues.name} onChange={(event) => updateCreateValue("name", event.target.value)} className={PROJECT_INPUT_CLASSNAME} placeholder="Usar o nome do modelo" />
            </label>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
              <select value={createValues.status} onChange={(event) => updateCreateValue("status", event.target.value as IntegracaoTaskStatus | "")} className={PROJECT_SELECT_CLASSNAME} style={PROJECT_SELECT_ARROW_STYLE}>
                <option value="">Usar regra de criação</option>
                {INTEGRACAO_TASK_STATUS_VALUES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>
          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Departamento</span>
              <select value={createValues.department_id} onChange={(event) => updateCreateValue("department_id", event.target.value)} className={PROJECT_SELECT_CLASSNAME} style={PROJECT_SELECT_ARROW_STYLE} disabled={departmentsQuery.isLoading || departmentsQuery.isError}>
                <option value="">Usar departamento do modelo</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cobrança</span>
              <select value={createValues.billing} onChange={(event) => updateCreateValue("billing", event.target.value as TaskBilling | "")} className={PROJECT_SELECT_CLASSNAME} style={PROJECT_SELECT_ARROW_STYLE}>
                <option value="">Usar cobrança do modelo</option>
                {TASK_BILLING_OPTIONS.map((billing) => <option key={billing} value={billing}>{billing}</option>)}
              </select>
            </label>
          </div>
          <div className={TASK_FORM_THREE_COLUMN_GRID_CLASSNAME}>
            {(["responsible_id", "responsible2_id", "responsible3_id"] as const).map((field, index) => (
              <label key={field} className={TASK_FORM_LABEL_CLASSNAME}>
                <span className="text-sm font-medium text-slate-700 dark:text-white">{index === 0 ? "Responsável" : `Responsável ${index + 1}`}</span>
                <select value={createValues[field]} onChange={(event) => updateCreateValue(field, event.target.value)} className={PROJECT_SELECT_CLASSNAME} style={PROJECT_SELECT_ARROW_STYLE} disabled={usersQuery.isLoading || usersQuery.isError}>
                  <option value="">Usar responsável do modelo</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className={TASK_FORM_LABEL_CLASSNAME}>
            <span className="text-sm font-medium text-slate-700 dark:text-white">Previsão</span>
            <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="date" value={createValues.prevision_date} onChange={(event) => updateCreateValue("prevision_date", event.target.value)} className={`${PROJECT_INPUT_CLASSNAME} pl-10`} /></div>
          </label>

          <label className={TASK_FORM_LABEL_CLASSNAME}>
            <span className="text-sm font-medium text-slate-700 dark:text-white">Observações</span>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <textarea
                value={createValues.observations}
                onChange={(event) => updateCreateValue("observations", event.target.value)}
                className={`${PROJECT_INPUT_CLASSNAME} ${TASK_FORM_TEXTAREA_CLASSNAME}`}
                placeholder="Detalhes de criação da tarefa."
                required
              />
            </div>
          </label>
        </form>
      )}
    </Dialog>
  );
}

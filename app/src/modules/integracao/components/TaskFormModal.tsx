import { useEffect, useState } from "react";
import { CalendarDays, FileText, LoaderCircle, Save } from "lucide-react";
import { toast } from "react-toastify";

import { ClientSelectionField, type ClientPickerOption } from "@modules/clients";
import type { ModuleAccess } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import { Dialog } from "@shared/components/ui/Dialog";
import { useFetch } from "@shared/hooks";
import { useAuth } from "../../../context/AuthContext";

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
  TASK_FORM_DEPARTMENTS_QUERY_KEY,
  TASK_FORM_TASK_MODELS_QUERY_KEY,
  taskResponsibleOptionsQueryKey,
} from "../hooks/queryKeys";
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
  ProjectSelect,
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
  getAutomaticTaskResponsibleId,
  getProjectSelectPlaceholder,
  getTaskCreateValidationMessage,
  getTaskEditValidationMessage,
  getTaskUrgencyOptions,
  shouldBlockTaskEditForm,
} from "./taskFormModalUi";
import { TaskCompletionPanel } from "./TaskCompletionPanel";
import { TaskAttachmentPanel } from "./TaskAttachmentPanel";

interface TaskFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string | null;
  onSuccess?: (task: IntegracaoTaskDetail) => void;
  selectedClient: ClientPickerOption | null;
  integracaoAccess: Pick<ModuleAccess, "level">;
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
  prevision_date: string;
}

interface EditFormState {
  model_id: string;
  name: string;
  status: IntegracaoTaskStatus | "";
  department_id: string;
  observations: string;
  billing: TaskBilling;
  urgency: string;
  responsible_id: string;
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
  prevision_date: "",
};

const EDIT_INITIAL_STATE: EditFormState = {
  model_id: "",
  name: "",
  status: "",
  department_id: "",
  observations: "",
  billing: "Não Realizar",
  urgency: "",
  responsible_id: "",
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
    return (
      (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
      "string"
  ) {
    return (
      (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback
    );
  }

  return fallback;
}

export function TaskFormModal({
  open,
  onOpenChange,
  taskId,
  onSuccess,
  selectedClient,
  integracaoAccess,
}: TaskFormModalProps) {
  const isEditing = Boolean(taskId);
  const isRestrictedEdit =
    isEditing && (integracaoAccess.level === "none" || integracaoAccess.level === "view");
  const [createValues, setCreateValues] = useState<CreateFormState>(CREATE_INITIAL_STATE);
  const [editValues, setEditValues] = useState<EditFormState>(EDIT_INITIAL_STATE);
  const projectsQuery = useProjectsList(
    !isEditing && createValues.client_id ? { ref: "client", id: createValues.client_id } : null,
  );
  const taskModelsQuery = useFetch(
    TASK_FORM_TASK_MODELS_QUERY_KEY,
    () => taskModelService.list({ type: "Projeto" }),
    {
      enabled: open && !isRestrictedEdit,
    },
  );
  const departmentsQuery = useFetch<DepItem[]>(
    TASK_FORM_DEPARTMENTS_QUERY_KEY,
    () => departmentService.list({ status: "Ativo" }),
    {
      enabled: open && !isRestrictedEdit,
    },
  );
  const taskDetailQuery = useIntegracaoTaskDetail(open && taskId ? taskId : undefined);
  const editResponsibleOptionsQuery = useFetch(
    taskResponsibleOptionsQueryKey(editValues.department_id),
    () => taskModelService.listOptions(editValues.department_id),
    {
      enabled: open && isEditing && !isRestrictedEdit && Boolean(editValues.department_id),
    },
  );
  const { user } = useAuth();
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
      model_id: detail.model_id ?? "",
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
      prevision_date: toDateInputValue(detail.prevision_date),
    });
  }, [open, taskDetailQuery.data]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoadingEditTask =
    isEditing &&
    shouldBlockTaskEditForm({
      isTaskLoading: taskDetailQuery.isLoading,
      isDepartmentsLoading: isRestrictedEdit ? false : departmentsQuery.isLoading,
      isUsersLoading: false,
    });
  const hasEditAuxiliaryOptionsWarning =
    isEditing &&
    !isRestrictedEdit &&
    (departmentsQuery.isError || taskModelsQuery.isError || editResponsibleOptionsQuery.isError);
  const hasRestrictedTaskAccessDenied =
    isRestrictedEdit &&
    Boolean(taskDetailQuery.data) &&
    ![
      taskDetailQuery.data?.responsible_id,
      taskDetailQuery.data?.responsible2_id,
      taskDetailQuery.data?.responsible3_id,
    ].includes(user?.id ?? null);
  const departments = departmentsQuery.data ?? [];
  const taskModels = taskModelsQuery.data ?? [];
  const createTaskModels = taskModels.filter(
    (model) => model.department_id === createValues.department_id,
  );
  const selectedCreateTaskModel = createTaskModels.find(
    (model) => model.id === createValues.model_id,
  );
  const createResponsibleCandidates = selectedCreateTaskModel?.department?.users ?? [];
  const editTaskModels = taskModels.filter(
    (model) => model.department_id === editValues.department_id,
  );
  const editResponsibleCandidates = editResponsibleOptionsQuery.data?.users ?? [];
  const shouldRenderCurrentDepartmentOption =
    Boolean(editValues.department_id) &&
    !departments.some((department) => department.id === editValues.department_id);
  const shouldRenderCurrentModelOption =
    Boolean(editValues.model_id) && !editTaskModels.some((model) => model.id === editValues.model_id);
  const createProjectsCount = projectsQuery.data?.length ?? null;
  const hasNoProjectsForSelectedClient =
    Boolean(createValues.client_id) && !projectsQuery.isLoading && createProjectsCount === 0;
  const projectSelectPlaceholder = getProjectSelectPlaceholder({
    hasClient: Boolean(createValues.client_id),
    isLoading: projectsQuery.isLoading,
    projectCount: createProjectsCount,
  });
  const editUrgencyOptions = getTaskUrgencyOptions(editValues.urgency);
  const taskEditValidationMessage = getTaskEditValidationMessage(editValues);

  function shouldRenderCurrentResponsibleOption(userId: string) {
    return (
      Boolean(userId) && !editResponsibleCandidates.some((candidate) => candidate.id === userId)
    );
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

  function updateCreateValue<Key extends keyof CreateFormState>(
    field: Key,
    value: CreateFormState[Key],
  ) {
    setCreateValues((currentValues) => {
      if (field === "department_id") {
        return {
          ...currentValues,
          department_id: value as string,
          model_id: "",
          responsible_id: "",
        };
      }

      if (field === "model_id") {
        const model = taskModels.find(({ id }) => id === value);
        return {
          ...currentValues,
          model_id: value as string,
          responsible_id: getAutomaticTaskResponsibleId(
            model?.responsible_id,
            model?.department?.users ?? [],
          ),
        };
      }

      return {
        ...currentValues,
        [field]: value,
        ...(field === "client_id" ? { project_id: "" } : {}),
      };
    });
  }

  function updateEditValue<Key extends keyof EditFormState>(field: Key, value: EditFormState[Key]) {
    setEditValues((currentValues) => {
      if (field === "department_id") {
        return {
          ...currentValues,
          department_id: value as string,
          model_id: "",
          responsible_id: "",
        };
      }

      if (field === "model_id") {
        const model = taskModels.find(({ id }) => id === value);
        return {
          ...currentValues,
          model_id: value as string,
          responsible_id: getAutomaticTaskResponsibleId(
            model?.responsible_id,
            model?.department?.users ?? [],
          ),
        };
      }

      return { ...currentValues, [field]: value };
    });
  }

  async function handleCreateSubmit() {
    const validationMessage = getTaskCreateValidationMessage({
      clientId: createValues.client_id,
      projectId: createValues.project_id,
      modelId: createValues.model_id,
      departmentId: createValues.department_id,
      prospectingStatus: createValues.prospecting_status,
      urgency: createValues.urgency,
      observations: createValues.observations,
      eligibleResponsibleCount: createResponsibleCandidates.length,
      responsibleId: createValues.responsible_id,
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
        department_id: createValues.department_id,
        observations: createValues.observations.trim(),
        billing: createValues.billing || undefined,
        urgency: createValues.urgency,
        responsible_id:
          createResponsibleCandidates.length === 0 ? null : createValues.responsible_id,
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

    if (isRestrictedEdit && !editValues.status) {
      toast.warning("Selecione um status para continuar.");
      return;
    }

    if (hasRestrictedTaskAccessDenied) {
      toast.error("Somente responsáveis pela tarefa podem atualizar status e observações.");
      return;
    }

    if (!isRestrictedEdit && taskEditValidationMessage) {
      toast.warning(taskEditValidationMessage);
      return;
    }

    const detail = taskDetailQuery.data;
    const relationshipChanged =
      Boolean(detail) &&
      (editValues.department_id !== detail.department_id || editValues.model_id !== detail.model_id);
    if (relationshipChanged && editResponsibleCandidates.length > 1 && !editValues.responsible_id) {
      toast.warning("Selecione um responsável elegível para a tarefa.");
      return;
    }

    const status = editValues.status as IntegracaoTaskStatus;
    if (status === "Concluída" && detail?.status !== "Concluída") {
      toast.warning("Use o painel de conclusão para enviar a solicitação.");
      return;
    }

    try {
      const updatedTask = await updateMutation.mutateAsync(
        isRestrictedEdit
          ? {
              task_id: taskId,
              status,
              observations: editValues.observations.trim(),
            }
          : {
              task_id: taskId,
              ...(editValues.model_id !== detail?.model_id
                ? { model_id: editValues.model_id }
                : {}),
              name: editValues.name.trim(),
              status,
              department_id: editValues.department_id,
              observations: editValues.observations.trim(),
              billing: editValues.billing,
              urgency: editValues.urgency.trim(),
              ...(editValues.responsible_id !== (detail?.responsible_id ?? "")
                ? { responsible_id: editValues.responsible_id }
                : {}),
              prevision_date: editValues.prevision_date || null,
            },
      );

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
          {!hasRestrictedTaskAccessDenied ? (
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
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEditing
                ? isRestrictedEdit
                  ? "Salvar status e observações"
                  : "Salvar alterações"
                : "Criar tarefa"}
            </button>
          ) : null}
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
      ) : hasRestrictedTaskAccessDenied ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Somente responsáveis pela tarefa podem atualizar status e observações.
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

          {isRestrictedEdit ? (
            <>
              <label className={TASK_FORM_LABEL_CLASSNAME}>
                <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
                <ProjectSelect
                  value={editValues.status}
                  onChange={(event) =>
                    updateEditValue("status", event.target.value as IntegracaoTaskStatus | "")
                  }
                >
                  <option value="">Selecione</option>
                  {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </ProjectSelect>
              </label>

              <label className={TASK_FORM_LABEL_CLASSNAME}>
                <span className="text-sm font-medium text-slate-700 dark:text-white">
                  Observações
                </span>
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
            </>
          ) : (
            <>
              <div className={TASK_FORM_THREE_COLUMN_GRID_CLASSNAME}>
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
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Modelo de tarefa
                  </span>
                  <ProjectSelect
                    value={editValues.model_id}
                    onChange={(event) => updateEditValue("model_id", event.target.value)}
                    disabled={
                      !editValues.department_id ||
                      taskModelsQuery.isLoading ||
                      taskModelsQuery.isError
                    }
                  >
                    <option value="">Selecione um modelo de tarefa</option>
                    {shouldRenderCurrentModelOption ? (
                      <option value={editValues.model_id}>Modelo atual</option>
                    ) : null}
                    {editTaskModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>

                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
                  <ProjectSelect
                    value={editValues.status}
                    onChange={(event) =>
                      updateEditValue("status", event.target.value as IntegracaoTaskStatus | "")
                    }
                  >
                    <option value="">Selecione</option>
                    {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>
              </div>

              <div className={TASK_FORM_GRID_CLASSNAME}>
                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Departamento
                  </span>
                  <ProjectSelect
                    value={editValues.department_id}
                    onChange={(event) => updateEditValue("department_id", event.target.value)}
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
                  </ProjectSelect>
                </label>

                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Cobrança
                  </span>
                  <ProjectSelect
                    value={editValues.billing}
                    onChange={(event) =>
                      updateEditValue("billing", event.target.value as TaskBilling)
                    }
                  >
                    {TASK_BILLING_OPTIONS.map((billing) => (
                      <option key={billing} value={billing}>
                        {billing}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>
              </div>

              <div className={TASK_FORM_GRID_CLASSNAME}>
                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Responsável
                  </span>
                  <ProjectSelect
                    value={editValues.responsible_id}
                    onChange={(event) => updateEditValue("responsible_id", event.target.value)}
                    disabled={
                      !editValues.department_id ||
                      editResponsibleOptionsQuery.isLoading ||
                      editResponsibleOptionsQuery.isError
                    }
                  >
                    <option
                      value=""
                      disabled={editResponsibleCandidates.length > 0}
                    >
                      {editResponsibleCandidates.length > 0
                        ? "Selecione um responsável"
                        : "Sem responsável"}
                    </option>
                    {shouldRenderCurrentResponsibleOption(editValues.responsible_id) ? (
                      <option value={editValues.responsible_id}>Responsável atual</option>
                    ) : null}
                    {editResponsibleCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>
              </div>

              <div className={TASK_FORM_GRID_CLASSNAME}>
                <label className={TASK_FORM_LABEL_CLASSNAME}>
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Previsão
                  </span>
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
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Urgência
                  </span>
                  <ProjectSelect
                    value={editValues.urgency}
                    onChange={(event) => updateEditValue("urgency", event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {editUrgencyOptions.map((urgency) => (
                      <option key={urgency} value={urgency}>
                        {urgency}
                      </option>
                    ))}
                  </ProjectSelect>
                </label>
              </div>

              <label className={TASK_FORM_LABEL_CLASSNAME}>
                <span className="text-sm font-medium text-slate-700 dark:text-white">
                  Observações
                </span>
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
            </>
          )}
          {taskDetailQuery.data ? (
            <TaskCompletionPanel
              task={taskDetailQuery.data}
              currentUserId={user?.id}
              accessLevel={integracaoAccess.level}
              isOwner={user?.type === "owner"}
            />
          ) : null}
          {taskDetailQuery.data ? (
            <TaskAttachmentPanel
              task={taskDetailQuery.data}
              currentUserId={user?.id}
              accessLevel={integracaoAccess.level}
              isOwner={user?.type === "owner"}
            />
          ) : null}
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
              <ProjectSelect
                value={createValues.project_id}
                onChange={(event) => updateCreateValue("project_id", event.target.value)}
                disabled={
                  !createValues.client_id ||
                  projectsQuery.isLoading ||
                  hasNoProjectsForSelectedClient
                }
              >
                <option value="">{projectSelectPlaceholder}</option>
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Departamento
              </span>
              <ProjectSelect
                value={createValues.department_id}
                onChange={(event) => updateCreateValue("department_id", event.target.value)}
                disabled={departmentsQuery.isLoading || departmentsQuery.isError}
              >
                <option value="">{getDepartmentPlaceholder()}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Modelo de tarefa
              </span>
              <ProjectSelect
                value={createValues.model_id}
                onChange={(event) => updateCreateValue("model_id", event.target.value)}
                disabled={
                  !createValues.department_id ||
                  taskModelsQuery.isLoading ||
                  taskModelsQuery.isError
                }
              >
                <option value="">Selecione um modelo de tarefa</option>
                {createTaskModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">
                Status de prospecção
              </span>
              <ProjectSelect
                value={createValues.prospecting_status}
                onChange={(event) =>
                  updateCreateValue("prospecting_status", event.target.value as ProspectingStatus)
                }
              >
                {PROSPECTING_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </ProjectSelect>
            </label>

            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Urgência</span>
              <ProjectSelect
                value={createValues.urgency}
                onChange={(event) =>
                  updateCreateValue("urgency", event.target.value as TaskUrgencyOption)
                }
              >
                {TASK_URGENCY_OPTIONS.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    {urgency}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Nome</span>
              <input
                value={createValues.name}
                onChange={(event) => updateCreateValue("name", event.target.value)}
                className={PROJECT_INPUT_CLASSNAME}
                placeholder="Usar o nome do modelo"
              />
            </label>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
              <ProjectSelect
                value={createValues.status}
                onChange={(event) =>
                  updateCreateValue("status", event.target.value as IntegracaoTaskStatus | "")
                }
              >
                <option value="">Usar regra de criação</option>
                {INTEGRACAO_TASK_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>
          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cobrança</span>
              <ProjectSelect
                value={createValues.billing}
                onChange={(event) =>
                  updateCreateValue("billing", event.target.value as TaskBilling | "")
                }
              >
                <option value="">Usar cobrança do modelo</option>
                {TASK_BILLING_OPTIONS.map((billing) => (
                  <option key={billing} value={billing}>
                    {billing}
                  </option>
                ))}
              </ProjectSelect>
            </label>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Previsão</span>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={createValues.prevision_date}
                  onChange={(event) => updateCreateValue("prevision_date", event.target.value)}
                  className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                />
              </div>
            </label>
          </div>
          <div className={TASK_FORM_GRID_CLASSNAME}>
            <label className={TASK_FORM_LABEL_CLASSNAME}>
              <span className="text-sm font-medium text-slate-700 dark:text-white">Responsável</span>
              <ProjectSelect
                value={createValues.responsible_id}
                onChange={(event) => updateCreateValue("responsible_id", event.target.value)}
                disabled={
                  !createValues.model_id ||
                  taskModelsQuery.isLoading ||
                  taskModelsQuery.isError ||
                  createResponsibleCandidates.length <= 1
                }
              >
                <option value="" disabled={createResponsibleCandidates.length > 0}>
                  {createResponsibleCandidates.length > 0
                    ? "Selecione um responsável"
                    : "Sem responsável"}
                </option>
                {createResponsibleCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </ProjectSelect>
            </label>
          </div>

          <label className={TASK_FORM_LABEL_CLASSNAME}>
            <span className="text-sm font-medium text-slate-700 dark:text-white">Observações</span>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <textarea
                value={createValues.observations}
                onChange={(event) => updateCreateValue("observations", event.target.value)}
                className={`${PROJECT_INPUT_CLASSNAME} ${TASK_FORM_TEXTAREA_CLASSNAME}`}
                placeholder="Detalhes de criação da tarefa."
              />
            </div>
          </label>
        </form>
      )}
    </Dialog>
  );
}

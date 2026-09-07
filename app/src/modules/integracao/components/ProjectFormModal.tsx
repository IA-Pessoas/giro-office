import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { ClientSelectionField } from "@modules/clients";
import { departmentService } from "@modules/departments";
import { Dialog } from "@shared/components/ui/Dialog";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { useFetch } from "@shared/hooks";

import { useProjectForm } from "../hooks/useProjectForm";
import {
  useCreateProjectWizardMutation,
  useProjectDetail,
  useUpdateProjectMutation,
} from "../hooks/useProjects";
import type { ProjectDetail, ProjectWizardTask } from "../types";
import { taskModelService } from "../services/taskModelService";
import {
  formatProjectDate,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SECONDARY_BUTTON_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
  ProjectSelect,
} from "./projectUi";
import {
  getAutomaticTaskResponsibleId,
  TASK_FORM_AUXILIARY_WARNING_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_LABEL_CLASSNAME,
} from "./taskFormModalUi";

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  projectId?: string | null;
  onSuccess?: (project: ProjectDetail | { id: string; client_id?: string }) => void;
}

function getSaveErrorMessage(error: unknown): string {
  const message = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data
    ?.error;
  return typeof message === "string" ? message : "Não foi possível salvar o projeto.";
}

export function ProjectFormModal({
  open,
  onOpenChange,
  clientId,
  projectId,
  onSuccess,
}: ProjectFormModalProps) {
  const router = useRouter();
  const isEditing = Boolean(projectId);
  const detailQuery = useProjectDetail(open && projectId ? projectId : undefined);
  const createWizardMutation = useCreateProjectWizardMutation();
  const updateMutation = useUpdateProjectMutation();
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [tasks, setTasks] = useState<Array<ProjectWizardTask & { id: string }>>([]);
  const departmentsQuery = useFetch(
    ["task-form-departments"],
    () => departmentService.list({ status: "Ativo" }),
    { enabled: open && !isEditing },
  );
  const taskModelsQuery = useFetch(
    ["task-form-task-models"],
    () => taskModelService.list({ type: "Projeto" }),
    { enabled: open && !isEditing },
  );
  const idempotencyKeyRef = useRef<string | null>(null);
  const { values, updateValue, validate, reset, buildCreatePayload, buildUpdatePayload } =
    useProjectForm(detailQuery.data);

  useEffect(() => {
    if (!open) {
      reset(null);
      setCreateStep(1);
      setTasks([]);
      idempotencyKeyRef.current = null;
    } else if (!isEditing && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [isEditing, open, reset]);

  const isSaving = createWizardMutation.isPending || updateMutation.isPending;
  const dateRangeError =
    !isEditing && values.end_date && values.end_date < values.start_date
      ? "A data final não pode ser anterior à data de início."
      : null;
  const departments = departmentsQuery.data ?? [];
  const taskModels = taskModelsQuery.data ?? [];
  const taskOptionsLoading = departmentsQuery.isLoading || taskModelsQuery.isLoading;
  const taskOptionsError = departmentsQuery.isError || taskModelsQuery.isError;
  const taskValidationError = getTaskValidationError();

  function getTaskValidationError(): string | null {
    if (tasks.length === 0) return null;
    if (taskOptionsError)
      return "Não foi possível carregar departamentos e Modelos. Tente novamente.";
    if (taskOptionsLoading) return "Carregando departamentos e Modelos...";
    for (const task of tasks) {
      const model = taskModels.find(
        (item) => item.id === task.model_id && item.department_id === task.department_id,
      );
      if (!task.name.trim() || !model || !departments.some(({ id }) => id === task.department_id)) {
        return "Preencha nome, departamento e Modelo de todas as tarefas.";
      }
      const candidates = model.department?.users ?? [];
      if (candidates.length > 0 && !candidates.some(({ id }) => id === task.responsible_id)) {
        return "Selecione um responsável elegível para cada tarefa.";
      }
    }
    return null;
  }

  function updateTask(id: string, field: keyof ProjectWizardTask, value: string) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task;
        if (field === "department_id") {
          return { ...task, department_id: value, model_id: "", responsible_id: null };
        }
        if (field === "model_id") {
          const model = taskModels.find(
            (item) => item.id === value && item.department_id === task.department_id,
          );
          return {
            ...task,
            model_id: value,
            responsible_id:
              getAutomaticTaskResponsibleId(
                model?.responsible_id,
                model?.department?.users ?? [],
              ) || null,
          };
        }
        if (field === "prevision_date") return { ...task, prevision_date: value || undefined };
        return { ...task, [field]: value };
      }),
    );
  }

  function handleTasksReview() {
    if (taskValidationError) return;
    setTasks((current) => current.map((task) => ({ ...task, name: task.name.trim() })));
    setCreateStep(3);
  }

  async function handleUpdateSubmit() {
    if (isEditing && !detailQuery.data) {
      toast.error("Carregue o projeto antes de tentar editar.");
      return;
    }

    const validationError = validate();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      if (isEditing && projectId && detailQuery.data) {
        const updatedProject = await updateMutation.mutateAsync({
          ...buildUpdatePayload(projectId),
          clientId: detailQuery.data.client_id,
        });

        toast.success("Projeto atualizado com sucesso.");
        onSuccess?.(updatedProject);
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(getSaveErrorMessage(error));
    }
  }

  function handleCreateStepOne() {
    const validationError = validate();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (dateRangeError) return;

    setCreateStep(2);
  }

  async function handleWizardSubmit() {
    if (
      !clientId ||
      !idempotencyKeyRef.current ||
      isSaving ||
      taskValidationError ||
      dateRangeError
    ) {
      return;
    }

    try {
      const result = await createWizardMutation.mutateAsync({
        ...buildCreatePayload(clientId),
        idempotencyKey: idempotencyKeyRef.current,
        tasks: tasks.map(({ id: _id, ...task }) => task),
      });
      toast.success(
        `Projeto criado com sucesso. Tarefas principais: ${result.counts.main}. Dependências: ${result.counts.dependencies}. Sem responsável: ${result.counts.unassigned}.`,
      );
      onSuccess?.(result.project);
      onOpenChange(false);
      await router.push(`/tasks?clientId=${clientId}`);
    } catch (error) {
      toast.error(getSaveErrorMessage(error));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar projeto" : "Novo projeto"}
      description={isEditing ? "Formulário de projeto" : `Etapa ${createStep} de 3`}
      contentClassName="w-[min(92vw,760px)] [&>footer]:flex-wrap"
      preventClose={isSaving}
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
          {isEditing ? (
            <button
              type="button"
              onClick={() => void handleUpdateSubmit()}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
              disabled={isSaving || !detailQuery.data}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar alterações
            </button>
          ) : createStep === 1 ? (
            <button
              type="button"
              onClick={handleCreateStepOne}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
              disabled={isSaving || !clientId}
            >
              Continuar
            </button>
          ) : createStep === 2 ? (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleTasksReview}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isSaving || Boolean(taskValidationError)}
              >
                {tasks.length ? "Revisar tarefas" : "Pular e revisar"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Voltar para etapa 1
              </button>
              <button
                type="button"
                onClick={() => setCreateStep(2)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isSaving}
              >
                Voltar para tarefas
              </button>
              <button
                type="button"
                onClick={() => void handleWizardSubmit()}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isSaving || !clientId || Boolean(taskValidationError)}
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Criar projeto
              </button>
            </>
          )}
        </>
      }
    >
      {isEditing && detailQuery.isLoading ? (
        <div className="flex min-h-52 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Carregando projeto...
        </div>
      ) : detailQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
          Não foi possível carregar os dados do projeto para edição.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isEditing) {
              void handleUpdateSubmit();
            } else if (createStep === 1) {
              handleCreateStepOne();
            } else if (createStep === 2) {
              handleTasksReview();
            } else {
              void handleWizardSubmit();
            }
          }}
        >
          {!isEditing ? (
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-white">Cliente</span>
              <ClientSelectionField clientId={clientId} />
            </div>
          ) : null}

          {isEditing || createStep === 1 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <RequiredFieldLabel
                    className="text-sm font-medium text-slate-700 dark:text-white"
                    required
                  >
                    Nome
                  </RequiredFieldLabel>
                  <input
                    type="text"
                    value={values.name}
                    onChange={(event) => updateValue("name", event.target.value)}
                    className={PROJECT_INPUT_CLASSNAME}
                    placeholder="Ex.: Implantação fiscal"
                    aria-required="true"
                  />
                </label>

                <label className="space-y-2">
                  <RequiredFieldLabel
                    className="text-sm font-medium text-slate-700 dark:text-white"
                    required
                  >
                    Data de início
                  </RequiredFieldLabel>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={values.start_date}
                      onChange={(event) => updateValue("start_date", event.target.value)}
                      onInput={(event) => updateValue("start_date", event.currentTarget.value)}
                      className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                      required
                    />
                  </div>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-white">
                  Data final prevista
                </span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={values.end_date}
                    onChange={(event) => updateValue("end_date", event.target.value)}
                    onInput={(event) => updateValue("end_date", event.currentTarget.value)}
                    className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                    aria-invalid={Boolean(dateRangeError)}
                    aria-describedby={dateRangeError ? "project-end-date-error" : undefined}
                  />
                </div>
                {dateRangeError ? (
                  <p
                    id="project-end-date-error"
                    role="alert"
                    className="text-sm text-rose-600 dark:text-rose-400"
                  >
                    {dateRangeError}
                  </p>
                ) : null}
              </label>

              <label className="space-y-2">
                <RequiredFieldLabel
                  className="text-sm font-medium text-slate-700 dark:text-white"
                  required
                >
                  Objetivo
                </RequiredFieldLabel>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" />
                  <textarea
                    value={values.objective}
                    onChange={(event) => updateValue("objective", event.target.value)}
                    className={`${PROJECT_INPUT_CLASSNAME} min-h-32 resize-y pl-10`}
                    placeholder="Descreva o objetivo do projeto."
                    aria-required="true"
                  />
                </div>
              </label>
            </>
          ) : null}

          {!isEditing && createStep === 2 ? (
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <p className={`${PROJECT_SUBPANEL_CLASSNAME} px-4 py-3 text-sm`}>
                  Nenhuma tarefa será criada nesta etapa.
                </p>
              ) : null}
              {taskOptionsLoading ? (
                <output className="block">Carregando departamentos e Modelos...</output>
              ) : null}
              {taskOptionsError ? (
                <div role="alert" className={TASK_FORM_AUXILIARY_WARNING_CLASSNAME}>
                  Não foi possível carregar departamentos e Modelos.
                  <button
                    type="button"
                    className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                    onClick={() => {
                      void departmentsQuery.refetch();
                      void taskModelsQuery.refetch();
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}
              {tasks.map((task, index) => {
                const models = taskModels.filter(
                  ({ department_id }) => department_id === task.department_id,
                );
                const candidates =
                  models.find(({ id }) => id === task.model_id)?.department?.users ?? [];
                const outsidePeriod =
                  task.prevision_date &&
                  (task.prevision_date < values.start_date ||
                    (values.end_date && task.prevision_date > values.end_date));
                const warningId = `task-${task.id}-date-warning`;
                return (
                  <fieldset key={task.id} className={`${PROJECT_SUBPANEL_CLASSNAME} space-y-3 p-3`}>
                    <legend className="px-1 text-sm font-semibold">Tarefa {index + 1}</legend>
                    <div className={TASK_FORM_GRID_CLASSNAME}>
                      <label className={TASK_FORM_LABEL_CLASSNAME}>
                        <RequiredFieldLabel required>Nome</RequiredFieldLabel>
                        <input
                          value={task.name}
                          onChange={(event) => updateTask(task.id, "name", event.target.value)}
                          className={PROJECT_INPUT_CLASSNAME}
                          aria-required="true"
                        />
                      </label>
                      <label className={TASK_FORM_LABEL_CLASSNAME}>
                        <span>Prazo</span>
                        <input
                          type="date"
                          value={task.prevision_date ?? ""}
                          onChange={(event) =>
                            updateTask(task.id, "prevision_date", event.target.value)
                          }
                          onInput={(event) =>
                            updateTask(task.id, "prevision_date", event.currentTarget.value)
                          }
                          className={PROJECT_INPUT_CLASSNAME}
                          aria-describedby={outsidePeriod ? warningId : undefined}
                        />
                      </label>
                    </div>
                    {outsidePeriod ? (
                      <output className={`block ${TASK_FORM_AUXILIARY_WARNING_CLASSNAME}`}>
                        <span id={warningId}>Prazo fora do período do projeto.</span>
                      </output>
                    ) : null}
                    <div className={TASK_FORM_GRID_CLASSNAME}>
                      <label
                        htmlFor={`task-${task.id}-department`}
                        className={TASK_FORM_LABEL_CLASSNAME}
                      >
                        <RequiredFieldLabel required>Departamento</RequiredFieldLabel>
                        <ProjectSelect
                          id={`task-${task.id}-department`}
                          value={task.department_id}
                          onChange={(event) =>
                            updateTask(task.id, "department_id", event.target.value)
                          }
                          disabled={taskOptionsLoading || taskOptionsError}
                          aria-required="true"
                        >
                          <option value="">Selecione um departamento</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </ProjectSelect>
                      </label>
                      <label
                        htmlFor={`task-${task.id}-model`}
                        className={TASK_FORM_LABEL_CLASSNAME}
                      >
                        <RequiredFieldLabel required>Modelo</RequiredFieldLabel>
                        <ProjectSelect
                          id={`task-${task.id}-model`}
                          value={task.model_id}
                          onChange={(event) => updateTask(task.id, "model_id", event.target.value)}
                          disabled={!task.department_id || taskOptionsLoading || taskOptionsError}
                          aria-required="true"
                        >
                          <option value="">Selecione um Modelo</option>
                          {models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </ProjectSelect>
                      </label>
                    </div>
                    <label
                      htmlFor={`task-${task.id}-responsible`}
                      className={`block ${TASK_FORM_LABEL_CLASSNAME}`}
                    >
                      <RequiredFieldLabel required={candidates.length > 1}>
                        Responsável
                      </RequiredFieldLabel>
                      <ProjectSelect
                        id={`task-${task.id}-responsible`}
                        value={task.responsible_id ?? ""}
                        onChange={(event) =>
                          updateTask(task.id, "responsible_id", event.target.value)
                        }
                        disabled={
                          !task.model_id ||
                          taskOptionsLoading ||
                          taskOptionsError ||
                          candidates.length <= 1
                        }
                        aria-required={candidates.length > 1}
                      >
                        <option value="" disabled={candidates.length > 0}>
                          {candidates.length ? "Selecione um responsável" : "Sem responsável"}
                        </option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </ProjectSelect>
                    </label>
                    <button
                      type="button"
                      className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                      onClick={() =>
                        setTasks((current) => current.filter(({ id }) => id !== task.id))
                      }
                    >
                      Remover tarefa
                    </button>
                  </fieldset>
                );
              })}
              {taskValidationError ? (
                <p role="alert" className={TASK_FORM_AUXILIARY_WARNING_CLASSNAME}>
                  {taskValidationError}
                </p>
              ) : null}
              <button
                type="button"
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={taskOptionsLoading || taskOptionsError}
                onClick={() =>
                  setTasks((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      department_id: "",
                      model_id: "",
                      responsible_id: null,
                    },
                  ])
                }
              >
                Adicionar tarefa
              </button>
            </div>
          ) : null}

          {!isEditing && createStep === 3 ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
              <h3 className="font-semibold text-slate-900 dark:text-white">Revisão</h3>
              <p>
                <span className="font-medium">Nome:</span> {values.name}
              </p>
              <p>
                <span className="font-medium">Início:</span> {values.start_date}
              </p>
              {values.end_date ? (
                <p>
                  <span className="font-medium">Término:</span> {values.end_date}
                </p>
              ) : null}
              <p>
                <span className="font-medium">Objetivo:</span> {values.objective}
              </p>
              {tasks.length ? (
                <div className="overflow-x-auto">
                  <table
                    aria-label="Tarefas revisadas"
                    className="w-full text-left text-sm [&_td]:p-2 [&_th]:p-2"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Nome</th>
                        <th scope="col">Prazo</th>
                        <th scope="col">Departamento</th>
                        <th scope="col">Modelo</th>
                        <th scope="col">Responsável</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => {
                        const model = taskModels.find(({ id }) => id === task.model_id);
                        return (
                          <tr key={task.id}>
                            <td>{task.name}</td>
                            <td>{formatProjectDate(task.prevision_date)}</td>
                            <td>{departments.find(({ id }) => id === task.department_id)?.name}</td>
                            <td>{model?.name}</td>
                            <td>
                              {model?.department?.users.find(({ id }) => id === task.responsible_id)
                                ?.name ?? "Sem responsável"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Nenhuma tarefa será criada nesta etapa.</p>
              )}
              {taskValidationError ? (
                <p role="alert" className={TASK_FORM_AUXILIARY_WARNING_CLASSNAME}>
                  {taskValidationError}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}

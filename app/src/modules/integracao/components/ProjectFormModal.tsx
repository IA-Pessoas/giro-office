import { ClientSelectionField } from "@modules/clients";
import { departmentService } from "@modules/departments";
import { ConfirmationDialog, Dialog } from "@shared/components";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { useFetch } from "@shared/hooks";
import { isAxiosError } from "axios";
import { FileText, LoaderCircle, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "@shared/services/toast";

import {
  TASK_FORM_DEPARTMENTS_QUERY_KEY,
  TASK_FORM_TASK_MODELS_QUERY_KEY,
} from "../hooks/queryKeys";
import { useProjectForm } from "../hooks/useProjectForm";
import {
  useCreateProjectWizardMutation,
  useExtractProjectTasksMutation,
  useProjectDetail,
  useProjectWizardPreviewMutation,
  useUpdateProjectMutation,
} from "../hooks/useProjects";
import {
  getProjectStatusOptions,
  PROJECT_TASK_EXTRACTION_FAILURE_MESSAGE,
} from "../services/projectService.contract";
import { taskModelService } from "../services/taskModelService";
import type {
  ProjectDetail,
  ProjectWizardPreview,
  ProjectWizardTask,
  ProjectWizardTaskProposal,
} from "../types";
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
  applyWizardTaskChange,
  canAttemptWizardExtraction,
  WIZARD_EXTRACTION_UNAVAILABLE_CODE,
  WIZARD_EXTRACTION_UNAVAILABLE_MESSAGE,
  wizardExtractionConsumesAttempt,
  createProjectWizardId,
  getWizardExtractionSourceValidationMessage,
  getProjectWizardSuccessMessage,
  getWizardTaskDateWarning,
  WIZARD_EXTRACTION_MAX_ATTEMPTS,
} from "./projectWizardUi";
import {
  TASK_FORM_AUXILIARY_WARNING_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_LABEL_CLASSNAME,
} from "./taskFormModalUi";

type WizardTask = ProjectWizardTaskProposal & { id: string; source: "ai" | "manual" };
type PendingWizardConfirmation =
  | "clear-meeting-minutes"
  | "remove-meeting-minutes-file"
  | "discard-wizard"
  | null;

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  projectId?: string | null;
  onSuccess?: (project: ProjectDetail | { id: string; client_id?: string }) => void;
}

function getRequestErrorMessage(
  error: unknown,
  fallback = "Não foi possível salvar o projeto.",
): string {
  const message = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data
    ?.error;
  return typeof message === "string" ? message : fallback;
}

function toWizardTaskPayload({
  id: _id,
  source: _source,
  prevision_date_warning: _warning,
  ...task
}: WizardTask): ProjectWizardTask {
  return task;
}

function dependencyModelIdsSignature(preview: ProjectWizardPreview): string {
  return preview.tasks
    .flatMap((task) => task.dependencies.map((dependency) => dependency.model_id))
    .sort()
    .join("|");
}

function getResponsibleName(
  responsibleId: string | null,
  candidates: Array<{ id: string; name: string }>,
): string {
  if (responsibleId === null) return "Sem responsável";
  return (
    candidates.find(({ id }) => id === responsibleId)?.name ??
    `Responsável não carregado (${responsibleId})`
  );
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
  const previewMutation = useProjectWizardPreviewMutation();
  const updateMutation = useUpdateProjectMutation();
  const [hasValidated, setHasValidated] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [tasks, setTasks] = useState<WizardTask[]>([]);
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [meetingMinutesFile, setMeetingMinutesFile] = useState<File | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingWizardConfirmation>(null);
  const extractTasksMutation = useExtractProjectTasksMutation();
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [extractionAttempts, setExtractionAttempts] = useState(0);
  // Extração não configurada no servidor: o botão fica desabilitado até fechar o modal.
  const [extractionUnavailable, setExtractionUnavailable] = useState(false);
  const [preview, setPreview] = useState<ProjectWizardPreview | null>(null);
  const [dependenciesChanged, setDependenciesChanged] = useState(false);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const departmentsQuery = useFetch(
    TASK_FORM_DEPARTMENTS_QUERY_KEY,
    () => departmentService.list({ status: "Ativo" }),
    { enabled: open && !isEditing },
  );
  const taskModelsQuery = useFetch(
    TASK_FORM_TASK_MODELS_QUERY_KEY,
    () => taskModelService.list({ type: "Projeto" }),
    { enabled: open && !isEditing },
  );
  const idempotencyKeyRef = useRef<string | null>(null);
  const meetingMinutesFileRef = useRef<HTMLInputElement>(null);
  const extractionRequestLockRef = useRef(false);
  const previewRequestLockRef = useRef(false);
  const {
    values,
    updateValue,
    validate,
    validationErrors,
    reset,
    buildCreatePayload,
    buildUpdatePayload,
  } = useProjectForm(detailQuery.data);

  useEffect(() => {
    if (!open) {
      reset(null);
      setHasValidated(false);
      setExtractionError(null);
      setSubmitError(null);
      setCreateStep(1);
      setTasks([]);
      setMeetingMinutes("");
      setMeetingMinutesFile(null);
      setPendingConfirmation(null);
      setExtractionAttempts(0);
      setExtractionUnavailable(false);
      if (meetingMinutesFileRef.current) meetingMinutesFileRef.current.value = "";
      setPreview(null);
      setDependenciesChanged(false);
      setPreviewErrorMessage(null);
      previewMutation.reset();
      extractTasksMutation.reset();
      idempotencyKeyRef.current = null;
      extractionRequestLockRef.current = false;
      previewRequestLockRef.current = false;
    } else if (!isEditing && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createProjectWizardId();
    }
  }, [extractTasksMutation.reset, isEditing, open, previewMutation.reset, reset]);

  const isBusy =
    createWizardMutation.isPending ||
    previewMutation.isPending ||
    updateMutation.isPending ||
    extractTasksMutation.isPending;
  const dateRangeError =
    !isEditing && values.end_date && values.end_date < values.start_date
      ? "A data final não pode ser anterior à data de início."
      : null;
  const departments = departmentsQuery.data ?? [];
  const taskModels = taskModelsQuery.data ?? [];
  const taskOptionsLoading = departmentsQuery.isLoading || taskModelsQuery.isLoading;
  const taskOptionsError = departmentsQuery.isError || taskModelsQuery.isError;
  const taskValidationError = getTaskValidationError();
  const hasMeetingMinutesText = Boolean(meetingMinutes.trim());
  const canExtractTasks = canAttemptWizardExtraction(extractionAttempts);
  const hasAiProposals = tasks.some(({ source }) => source === "ai");
  const hasWizardDraft =
    !isEditing &&
    (createStep !== 1 ||
      Boolean(values.name.trim()) ||
      Boolean(values.objective.trim()) ||
      Boolean(values.start_date) ||
      Boolean(values.end_date) ||
      tasks.length > 0 ||
      hasMeetingMinutesText ||
      Boolean(meetingMinutesFile) ||
      extractionAttempts > 0);

  function getTaskValidationError(): string | null {
    if (tasks.length === 0) return null;
    if (taskOptionsError)
      return "Não foi possível carregar departamentos e Modelos. Tente novamente.";
    if (taskOptionsLoading) return "Carregando departamentos e Modelos...";
    const usedModelIds = new Set<string>();
    for (const task of tasks) {
      const model = taskModels.find(
        (item) => item.id === task.model_id && item.department_id === task.department_id,
      );
      if (!task.name.trim() || !model || !departments.some(({ id }) => id === task.department_id)) {
        return "Preencha nome, departamento e Modelo de todas as tarefas.";
      }
      if (usedModelIds.has(task.model_id)) {
        return `O Modelo "${model.name}" já foi usado. Selecione um Modelo diferente para cada tarefa.`;
      }
      usedModelIds.add(task.model_id);
      const candidates = model.department?.users ?? [];
      if (candidates.length > 0 && !candidates.some(({ id }) => id === task.responsible_id)) {
        return "Selecione um responsável elegível para cada tarefa.";
      }
    }
    return null;
  }

  function updateTask(id: string, field: keyof ProjectWizardTask, value: string) {
    if (isBusy) return;
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? applyWizardTaskChange(task, field, value, taskModels) : task,
      ),
    );
  }

  async function handleExtractTasks() {
    if (extractionRequestLockRef.current || extractTasksMutation.isPending || !canExtractTasks) {
      return;
    }

    setExtractionError(null);
    const sourceValidationMessage = getWizardExtractionSourceValidationMessage({
      text: meetingMinutes,
      file: meetingMinutesFile,
    });
    if (sourceValidationMessage) {
      setExtractionError(sourceValidationMessage);
      return;
    }

    extractionRequestLockRef.current = true;
    setExtractionAttempts((current) => current + 1);

    try {
      const proposals = await extractTasksMutation.mutateAsync({
        name: values.name,
        objective: values.objective,
        start_date: values.start_date,
        end_date: values.end_date,
        ...(meetingMinutesFile ? { file: meetingMinutesFile } : { content: meetingMinutes }),
      });

      setTasks((current) => [
        ...current.filter((task) => task.source === "manual"),
        // O Modelo proposto passa pela mesma cascata da edição manual, para já trazer o
        // responsável automático quando o departamento tiver um único elegível.
        ...proposals.map((proposal) =>
          applyWizardTaskChange(
            { ...proposal, id: createProjectWizardId(), source: "ai" as const },
            "model_id",
            proposal.model_id,
            taskModels,
          ),
        ),
      ]);
      toast.success(`Tarefas propostas pela IA: ${proposals.length}. Revise antes de continuar.`);
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (!wizardExtractionConsumesAttempt(status)) {
        setExtractionAttempts((current) => current - 1);
      }
      if (
        isAxiosError(error) &&
        error.response?.data?.code === WIZARD_EXTRACTION_UNAVAILABLE_CODE
      ) {
        setExtractionUnavailable(true);
        return;
      }
      setExtractionError(getRequestErrorMessage(error, PROJECT_TASK_EXTRACTION_FAILURE_MESSAGE));
    } finally {
      extractionRequestLockRef.current = false;
    }
  }

  function changeMeetingMinutesSource(
    action: Exclude<PendingWizardConfirmation, "discard-wizard" | null>,
  ) {
    setExtractionError(null);
    setTasks((current) => current.filter(({ source }) => source === "manual"));

    if (action === "clear-meeting-minutes") {
      setMeetingMinutes("");
      return;
    }

    setMeetingMinutesFile(null);
    if (meetingMinutesFileRef.current) meetingMinutesFileRef.current.value = "";
  }

  function handleMeetingMinutesSourceChange(
    action: Exclude<PendingWizardConfirmation, "discard-wizard" | null>,
  ) {
    if (hasAiProposals) {
      setPendingConfirmation(action);
      return;
    }

    changeMeetingMinutesSource(action);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen || isEditing || !hasWizardDraft) {
      onOpenChange(nextOpen);
      return;
    }

    setPendingConfirmation("discard-wizard");
  }

  function handleConfirmPendingAction() {
    if (pendingConfirmation === "discard-wizard") {
      onOpenChange(false);
      return;
    }

    if (pendingConfirmation) {
      changeMeetingMinutesSource(pendingConfirmation);
    }
  }

  function handleTasksReview() {
    if (previewRequestLockRef.current || isBusy || taskValidationError) return;
    previewRequestLockRef.current = true;
    const reviewedTasks = tasks.map((task) => ({ ...task, name: task.name.trim() }));
    const mainTasks = reviewedTasks.map(toWizardTaskPayload);
    setPreviewErrorMessage(null);

    previewMutation.mutate(mainTasks, {
      onSuccess: (nextPreview) => {
        setDependenciesChanged(
          preview
            ? dependencyModelIdsSignature(preview) !== dependencyModelIdsSignature(nextPreview)
            : false,
        );
        setPreview(nextPreview);
        setTasks(reviewedTasks);
        setCreateStep(3);
      },
      onError: (error) => {
        setPreviewErrorMessage(
          getRequestErrorMessage(error, "Não foi possível gerar a prévia das dependências."),
        );
      },
      onSettled: () => {
        previewRequestLockRef.current = false;
      },
    });
  }

  async function handleUpdateSubmit() {
    if (isEditing && !detailQuery.data) {
      toast.error("Carregue o projeto antes de tentar editar.");
      return;
    }

    setSubmitError(null);
    setHasValidated(true);
    const validationError = validate();

    if (validationError) return;

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
      setSubmitError(getRequestErrorMessage(error));
    }
  }

  function handleCreateStepOne() {
    setSubmitError(null);
    setHasValidated(true);
    const validationError = validate();

    if (validationError) return;

    if (dateRangeError) return;

    setCreateStep(2);
  }

  async function handleWizardSubmit() {
    if (
      !clientId ||
      !idempotencyKeyRef.current ||
      !preview ||
      isBusy ||
      taskValidationError ||
      dateRangeError
    ) {
      return;
    }

    setSubmitError(null);
    try {
      const result = await createWizardMutation.mutateAsync({
        ...buildCreatePayload(clientId),
        idempotencyKey: idempotencyKeyRef.current,
        tasks: tasks.map(toWizardTaskPayload),
        revision: preview.revision,
      });
      toast.success(getProjectWizardSuccessMessage(result.counts));
      onSuccess?.(result.project);
      onOpenChange(false);
      await router.push(`/tasks?clientId=${clientId}`);
    } catch (error) {
      setSubmitError(getRequestErrorMessage(error));
    }
  }

  const isSourceChangeConfirmation =
    pendingConfirmation === "clear-meeting-minutes" ||
    pendingConfirmation === "remove-meeting-minutes-file";

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isEditing ? "Editar projeto" : "Novo projeto"}
      description={isEditing ? "Formulário de projeto" : `Etapa ${createStep} de 3`}
      contentClassName="w-[min(92vw,760px)] [&>footer]:flex-wrap"
      preventClose={isBusy}
      footer={
        <>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
            disabled={isBusy}
          >
            Cancelar
          </button>
          {isEditing ? (
            <button
              type="button"
              onClick={() => void handleUpdateSubmit()}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
              disabled={isBusy || !detailQuery.data}
            >
              {isBusy ? (
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
              disabled={isBusy || !clientId}
            >
              Continuar
            </button>
          ) : createStep === 2 ? (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isBusy}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void handleTasksReview()}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isBusy || Boolean(taskValidationError)}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Gerando prévia...
                  </>
                ) : tasks.length ? (
                  "Revisar tarefas"
                ) : (
                  "Pular e revisar"
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreateStep(1)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isBusy}
              >
                Voltar para etapa 1
              </button>
              <button
                type="button"
                onClick={() => setCreateStep(2)}
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isBusy}
              >
                Voltar para tarefas
              </button>
              <button
                type="button"
                onClick={() => void handleWizardSubmit()}
                className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
                disabled={isBusy || !clientId || !preview || Boolean(taskValidationError)}
              >
                {isBusy ? (
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
      <ConfirmationDialog
        open={pendingConfirmation !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingConfirmation(null);
        }}
        title={isSourceChangeConfirmation ? "Descartar propostas da IA?" : "Descartar rascunho?"}
        description={
          isSourceChangeConfirmation
            ? "Trocar a fonte da Ata descartará as propostas da IA atuais. Deseja continuar?"
            : "Fechar agora vai descartar o rascunho deste projeto. Deseja continuar?"
        }
        onConfirm={handleConfirmPendingAction}
        isConfirming={isBusy}
        errorMessage={null}
        confirmLabel={isSourceChangeConfirmation ? "Trocar fonte" : "Descartar rascunho"}
        cancelLabel={isSourceChangeConfirmation ? "Manter fonte" : "Continuar editando"}
        variant="destructive"
      />

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
              void handleTasksReview();
            } else {
              void handleWizardSubmit();
            }
          }}
        >
          {submitError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {submitError}
            </p>
          ) : null}
          {hasValidated ? (
            <div className="space-y-1 text-sm text-rose-600 dark:text-rose-400">
              {Object.entries(validationErrors).map(([field, message]) =>
                message ? (
                  <p key={field} id={`project-${field}-error`} role="alert">
                    {message}
                  </p>
                ) : null,
              )}
            </div>
          ) : null}
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
                    aria-invalid={hasValidated && Boolean(validationErrors.name)}
                    aria-describedby={
                      hasValidated && validationErrors.name ? "project-name-error" : undefined
                    }
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
                    <input
                      aria-invalid={hasValidated && Boolean(validationErrors.start_date)}
                      aria-describedby={
                        hasValidated && validationErrors.start_date
                          ? "project-start_date-error"
                          : undefined
                      }
                      type="date"
                      value={values.start_date}
                      onChange={(event) => updateValue("start_date", event.target.value)}
                      onInput={(event) => updateValue("start_date", event.currentTarget.value)}
                      className={PROJECT_INPUT_CLASSNAME}
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
                  <input
                    type="date"
                    value={values.end_date}
                    onChange={(event) => updateValue("end_date", event.target.value)}
                    onInput={(event) => updateValue("end_date", event.currentTarget.value)}
                    className={PROJECT_INPUT_CLASSNAME}
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

              {isEditing ? (
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-white">Status</span>
                  <ProjectSelect
                    value={values.status}
                    onChange={(event) => updateValue("status", event.target.value)}
                    disabled={values.status === "Aguardando liberação do Comercial"}
                  >
                    {getProjectStatusOptions(values.status).map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </ProjectSelect>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Concluir exige todas as tarefas concluídas e perfil administrador.
                  </span>
                </label>
              ) : null}

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
                    aria-invalid={hasValidated && Boolean(validationErrors.objective)}
                    aria-describedby={
                      hasValidated && validationErrors.objective
                        ? "project-objective-error"
                        : undefined
                    }
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
              <fieldset className={`${PROJECT_SUBPANEL_CLASSNAME} space-y-3 p-3`}>
                <legend className="px-1 text-sm font-semibold">Ata de reunião</legend>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Tentativas de extração: {extractionAttempts} de {WIZARD_EXTRACTION_MAX_ATTEMPTS}.
                </p>
                <label className="space-y-2" htmlFor="project-meeting-minutes">
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Cole a Ata para extrair tarefas
                  </span>
                  <textarea
                    id="project-meeting-minutes"
                    value={meetingMinutes}
                    onChange={(event) => {
                      setMeetingMinutes(event.target.value);
                      setExtractionError(null);
                    }}
                    className={`${PROJECT_INPUT_CLASSNAME} min-h-32 resize-y`}
                    placeholder="Cole aqui o texto da Ata de reunião."
                    aria-invalid={Boolean(extractionError)}
                    aria-describedby={
                      extractionError
                        ? "project-meeting-minutes-notice project-extraction-error"
                        : "project-meeting-minutes-notice"
                    }
                    disabled={extractTasksMutation.isPending || Boolean(meetingMinutesFile)}
                  />
                </label>
                {hasMeetingMinutesText ? (
                  <button
                    type="button"
                    className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                    onClick={() => handleMeetingMinutesSourceChange("clear-meeting-minutes")}
                    disabled={extractTasksMutation.isPending}
                  >
                    Limpar texto
                  </button>
                ) : null}
                <label className="space-y-2" htmlFor="project-meeting-minutes-file">
                  <span className="text-sm font-medium text-slate-700 dark:text-white">
                    Selecione um arquivo .txt, .md, .docx ou .pdf
                  </span>
                  <input
                    ref={meetingMinutesFileRef}
                    id="project-meeting-minutes-file"
                    type="file"
                    accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,text/x-markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                    onChange={(event) => {
                      setMeetingMinutesFile(event.target.files?.[0] ?? null);
                      setExtractionError(null);
                    }}
                    className={PROJECT_INPUT_CLASSNAME}
                    aria-invalid={Boolean(extractionError)}
                    aria-describedby={
                      extractionError
                        ? "project-meeting-minutes-notice project-extraction-error"
                        : "project-meeting-minutes-notice"
                    }
                    disabled={extractTasksMutation.isPending || hasMeetingMinutesText}
                  />
                </label>
                {meetingMinutesFile ? (
                  <div className="flex items-center gap-3 text-sm">
                    <span>{meetingMinutesFile.name}</span>
                    <button
                      type="button"
                      className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                      onClick={() =>
                        handleMeetingMinutesSourceChange("remove-meeting-minutes-file")
                      }
                      disabled={extractTasksMutation.isPending}
                    >
                      Remover arquivo
                    </button>
                  </div>
                ) : null}
                <p
                  id="project-meeting-minutes-notice"
                  className="text-sm text-slate-600 dark:text-slate-300"
                >
                  Ao clicar em “Extrair tarefas com IA”, o conteúdo da Ata será enviado para
                  processamento pela OpenAI. Nada é enviado antes desse clique.
                </p>
                <button
                  type="button"
                  className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                  onClick={() => void handleExtractTasks()}
                  disabled={
                    (!hasMeetingMinutesText && !meetingMinutesFile) ||
                    !canExtractTasks ||
                    extractionUnavailable ||
                    isBusy
                  }
                  aria-describedby={
                    extractionUnavailable ? "project-extraction-unavailable" : undefined
                  }
                >
                  {extractTasksMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Extrair tarefas com IA
                </button>
                {extractionError ? (
                  <p
                    id="project-extraction-error"
                    role="alert"
                    className="text-sm text-rose-600 dark:text-rose-400"
                  >
                    {extractionError}
                  </p>
                ) : null}
                {extractionUnavailable ? (
                  <output
                    id="project-extraction-unavailable"
                    className="block text-sm text-slate-600 dark:text-slate-300"
                  >
                    {WIZARD_EXTRACTION_UNAVAILABLE_MESSAGE}
                  </output>
                ) : null}
                {!canExtractTasks ? (
                  <output className="block text-sm text-slate-600 dark:text-slate-300">
                    Limite de 3 tentativas atingido. Continue adicionando tarefas manualmente.
                  </output>
                ) : null}
                {extractTasksMutation.isPending ? (
                  <output className="block text-sm">Extraindo tarefas da Ata...</output>
                ) : null}
              </fieldset>
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
                // Candidatos vêm do departamento: já dá para marcar a obrigatoriedade antes do Modelo.
                const candidates =
                  (models.find(({ id }) => id === task.model_id) ?? models[0])?.department
                    ?.users ?? [];
                const dateWarning = getWizardTaskDateWarning(
                  task,
                  values.start_date,
                  values.end_date,
                );
                const warningId = `task-${task.id}-date-warning`;
                return (
                  <fieldset
                    key={task.id}
                    disabled={isBusy}
                    className={`${PROJECT_SUBPANEL_CLASSNAME} space-y-3 p-3`}
                  >
                    <legend className="px-1 text-sm font-semibold">
                      {`Tarefa ${index + 1}${task.source === "ai" ? " (proposta pela IA)" : ""}`}
                    </legend>
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
                          aria-describedby={dateWarning ? warningId : undefined}
                        />
                      </label>
                    </div>
                    {dateWarning ? (
                      <output className={`block ${TASK_FORM_AUXILIARY_WARNING_CLASSNAME}`}>
                        <span id={warningId}>{dateWarning}</span>
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
                      <RequiredFieldLabel required={candidates.length > 0}>
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
                        aria-required={candidates.length > 0}
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
              {previewMutation.isError ? (
                <div role="alert" className={TASK_FORM_AUXILIARY_WARNING_CLASSNAME}>
                  {previewErrorMessage ?? "Não foi possível gerar a prévia das dependências."}
                  <button
                    type="button"
                    className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                    onClick={() => void handleTasksReview()}
                  >
                    Tentar gerar prévia
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
                disabled={isBusy || taskOptionsLoading || taskOptionsError}
                onClick={() =>
                  setTasks((current) => [
                    ...current,
                    {
                      id: createProjectWizardId(),
                      name: "",
                      department_id: "",
                      model_id: "",
                      responsible_id: null,
                      source: "manual" as const,
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
                <span className="font-medium">Início:</span> {formatProjectDate(values.start_date)}
              </p>
              {values.end_date ? (
                <p>
                  <span className="font-medium">Término:</span> {formatProjectDate(values.end_date)}
                </p>
              ) : null}
              <p>
                <span className="font-medium">Objetivo:</span> {values.objective}
              </p>
              {preview?.tasks.length ? (
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
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.tasks.flatMap((task) => {
                        const model = taskModels.find(({ id }) => id === task.model_id);
                        const department =
                          departments.find(({ id }) => id === task.department_id)?.name ??
                          task.department_id;
                        const responsible = getResponsibleName(
                          task.responsible_id,
                          model?.department?.users ?? [],
                        );
                        // O aviso de período acompanha a confirmação, sem impedi-la.
                        const dateWarning = getWizardTaskDateWarning(
                          task,
                          values.start_date,
                          values.end_date,
                        );
                        return [
                          <tr key={`main-${task.model_id}`}>
                            <td>{task.name}</td>
                            <td>
                              {formatProjectDate(task.prevision_date)}
                              {dateWarning ? (
                                <span className="block text-xs text-amber-700 dark:text-amber-300">
                                  {dateWarning}
                                </span>
                              ) : null}
                            </td>
                            <td>{department}</td>
                            <td>{model?.name ?? task.model_id}</td>
                            <td>{responsible}</td>
                            <td>{task.status}</td>
                          </tr>,
                          ...task.dependencies.map((dependency) => {
                            const dependencyModel = taskModels.find(
                              ({ id }) => id === dependency.model_id,
                            );
                            return (
                              <tr key={`dependency-${task.model_id}-${dependency.model_id}`}>
                                <td>
                                  {dependency.name}{" "}
                                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Incluída pelo Modelo: {model?.name ?? task.model_id}
                                  </span>
                                </td>
                                <td>Não informado</td>
                                <td>
                                  {departments.find(({ id }) => id === dependency.department_id)
                                    ?.name ?? dependency.department_id}
                                </td>
                                <td>{dependencyModel?.name ?? dependency.model_id}</td>
                                <td>
                                  {getResponsibleName(
                                    dependency.responsible_id,
                                    dependencyModel?.department?.users ?? [],
                                  )}
                                </td>
                                <td>{dependency.status}</td>
                              </tr>
                            );
                          }),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Nenhuma tarefa será criada nesta etapa.</p>
              )}
              {dependenciesChanged ? (
                <p role="alert" aria-label="Dependências atualizadas">
                  As dependências incluídas pelos Modelos foram atualizadas.
                </p>
              ) : null}
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

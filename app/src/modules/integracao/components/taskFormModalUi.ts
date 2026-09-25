export const TASK_FORM_CONTENT_CLASSNAME =
  "w-[min(92vw,760px)] [&>footer]:px-4 [&>footer]:py-3 [&>header]:px-4 [&>header]:py-3";

export const TASK_FORM_BODY_CLASSNAME = "max-h-[64vh] overflow-y-auto !px-4 !py-3";

export const TASK_FORM_FORM_CLASSNAME = "space-y-3";

export const TASK_FORM_GRID_CLASSNAME = "grid gap-3 md:grid-cols-2";

export const TASK_FORM_THREE_COLUMN_GRID_CLASSNAME = "grid gap-3 md:grid-cols-3";

export const TASK_FORM_LABEL_CLASSNAME = "space-y-1.5";

export const TASK_FORM_TEXTAREA_CLASSNAME = "min-h-20 resize-y pl-10";

export const TASK_FORM_AUXILIARY_WARNING_CLASSNAME =
  "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";

/** Projeto criado no modal "Nova tarefa" quando o cliente ainda não tem nenhum. */
export const LOOSE_TASKS_PROJECT_NAME = "Tarefas avulsas";

export function getAutomaticTaskResponsibleId(
  modelDefaultId: string | null | undefined,
  candidates: Array<{ id: string }>,
): string {
  if (modelDefaultId && candidates.some(({ id }) => id === modelDefaultId)) {
    return modelDefaultId;
  }

  return candidates.length === 1 ? candidates[0].id : "";
}

export function getTaskEditValidationMessage(values: {
  name: string;
  status: string;
  department_id: string;
  model_id: string;
  urgency: string;
}): string | null {
  return !values.name.trim() ||
    !values.status ||
    !values.department_id ||
    !values.model_id ||
    !values.urgency.trim()
    ? "Preencha nome, status, departamento, modelo e urgência."
    : null;
}

export const TASK_URGENCY_OPTIONS = ["Baixa", "Normal", "Alta", "Urgente"] as const;

export type TaskUrgencyOption = (typeof TASK_URGENCY_OPTIONS)[number];

export function getDefaultTaskUrgency(): TaskUrgencyOption {
  return "Normal";
}

export function isTaskUrgency(value: string): value is TaskUrgencyOption {
  return TASK_URGENCY_OPTIONS.includes(value as TaskUrgencyOption);
}

export function getTaskUrgencyOptions(currentValue?: string): readonly string[] {
  if (!currentValue || isTaskUrgency(currentValue)) {
    return TASK_URGENCY_OPTIONS;
  }

  return [currentValue, ...TASK_URGENCY_OPTIONS];
}

interface ShouldBlockTaskEditFormParams {
  isTaskLoading: boolean;
  isDepartmentsLoading: boolean;
  isUsersLoading: boolean;
}

export function shouldBlockTaskEditForm(params: ShouldBlockTaskEditFormParams): boolean {
  return params.isTaskLoading;
}

interface GetTaskCreateValidationMessageParams {
  clientId: string;
  projectId: string;
  modelId: string;
  departmentId: string;
  urgency: string;
  observations: string;
  eligibleResponsibleCount: number;
  responsibleId: string;
}

export type TaskCreateField =
  | "project_id"
  | "department_id"
  | "model_id"
  | "urgency"
  | "responsible_id";

/** Erro de cada campo da nova tarefa, mostrado abaixo do campo (#1367). */
export function getTaskCreateFieldErrors({
  projectId,
  modelId,
  departmentId,
  urgency,
  eligibleResponsibleCount,
  responsibleId,
}: GetTaskCreateValidationMessageParams): Partial<Record<TaskCreateField, string>> {
  const errors: Partial<Record<TaskCreateField, string>> = {};
  if (!projectId) errors.project_id = "Selecione o projeto.";
  if (!departmentId) errors.department_id = "Selecione o departamento.";
  if (!modelId) errors.model_id = "Selecione o modelo de tarefa.";
  if (!urgency) errors.urgency = "Selecione a urgência.";
  if (eligibleResponsibleCount > 1 && !responsibleId) {
    errors.responsible_id = "Selecione um responsável elegível para a tarefa.";
  }
  return errors;
}

export function getTaskCreateValidationMessage({
  clientId,
  projectId,
  modelId,
  departmentId,
  urgency,
  eligibleResponsibleCount,
  responsibleId,
}: GetTaskCreateValidationMessageParams): string | null {
  const missing = (
    [
      ["cliente", clientId],
      ["projeto", projectId],
      ["departamento", departmentId],
      ["modelo", modelId],
      ["urgência", urgency],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([label]) => label);
  if (missing.length > 0) {
    return `Preencha: ${missing.join(", ")}.`;
  }

  if (eligibleResponsibleCount > 1 && !responsibleId) {
    return "Selecione um responsável elegível para a tarefa.";
  }

  return null;
}

interface GetProjectSelectPlaceholderParams {
  hasClient: boolean;
  isLoading: boolean;
  projectCount: number | null;
}

export function getProjectSelectPlaceholder({
  hasClient,
  isLoading,
  projectCount,
}: GetProjectSelectPlaceholderParams): string {
  if (!hasClient) {
    return "Selecione o cliente primeiro";
  }

  if (isLoading) {
    return "Carregando projetos...";
  }

  if (projectCount === 0) {
    return "Nenhum projeto para este cliente";
  }

  return "Selecione um projeto";
}

/** Previsão só é definida direto quando a tarefa ainda não tem; depois, via prorrogação. */
export function getInitialPrevisionPatch(
  currentPrevision: string | null | undefined,
  value: string,
): { prevision_date?: string } {
  return !currentPrevision && value ? { prevision_date: value } : {};
}

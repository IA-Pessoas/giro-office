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

export const TASK_CREATE_REQUIRED_FIELDS_MESSAGE =
  "Preencha cliente, projeto, modelo, status de prospecção e urgência.";

export const TASK_CREATE_OBSERVATIONS_REQUIRED_MESSAGE = "Preencha as observações da tarefa.";

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
  prospectingStatus: string;
  urgency: string;
  observations: string;
}

export function getTaskCreateValidationMessage({
  clientId,
  projectId,
  modelId,
  prospectingStatus,
  urgency,
  observations,
}: GetTaskCreateValidationMessageParams): string | null {
  if (!clientId || !projectId || !modelId || !prospectingStatus || !urgency) {
    return TASK_CREATE_REQUIRED_FIELDS_MESSAGE;
  }

  if (!observations.trim()) {
    return TASK_CREATE_OBSERVATIONS_REQUIRED_MESSAGE;
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

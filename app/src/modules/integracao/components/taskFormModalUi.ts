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
  "Preencha cliente, projeto, departamento, modelo, status de prospecção e urgência.";

export function getAutomaticTaskResponsibleId(
  modelDefaultId: string | null | undefined,
  candidates: Array<{ id: string }>,
): string {
  if (modelDefaultId && candidates.some(({ id }) => id === modelDefaultId)) {
    return modelDefaultId;
  }

  return candidates.length === 1 ? candidates[0].id : "";
}

export const WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING = "Prazo fora do período do projeto.";

interface WizardTaskFields {
  name: string;
  department_id: string;
  model_id: string;
  responsible_id: string | null;
  prevision_date?: string;
  prevision_date_warning?: string;
}

interface WizardTaskModel {
  id: string;
  department_id: string;
  responsible_id?: string | null;
  department?: { users?: Array<{ id: string }> } | null;
}

/**
 * Trocar departamento ou Modelo derruba as seleções que deixaram de ser compatíveis; editar o
 * prazo derruba o aviso da IA sobre ele.
 */
export function applyWizardTaskChange<T extends WizardTaskFields>(
  task: T,
  field: "name" | "prevision_date" | "department_id" | "model_id" | "responsible_id",
  value: string,
  taskModels: WizardTaskModel[],
): T {
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
        getAutomaticTaskResponsibleId(model?.responsible_id, model?.department?.users ?? []) || null,
    };
  }

  if (field === "prevision_date") {
    return { ...task, prevision_date: value || undefined, prevision_date_warning: undefined };
  }

  return { ...task, [field]: value };
}

/** Aviso do prazo: o da IA enquanto o campo está vazio, o do período assim que ele é preenchido. */
export function getWizardTaskDateWarning(
  task: { prevision_date?: string; prevision_date_warning?: string },
  period: { start_date: string; end_date?: string },
): string | null {
  if (!task.prevision_date) return task.prevision_date_warning ?? null;

  return task.prevision_date < period.start_date ||
    (period.end_date ? task.prevision_date > period.end_date : false)
    ? WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING
    : null;
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
  prospectingStatus: string;
  urgency: string;
  observations: string;
  eligibleResponsibleCount: number;
  responsibleId: string;
}

export function getTaskCreateValidationMessage({
  clientId,
  projectId,
  modelId,
  departmentId,
  prospectingStatus,
  urgency,
  eligibleResponsibleCount,
  responsibleId,
}: GetTaskCreateValidationMessageParams): string | null {
  if (!clientId || !projectId || !departmentId || !modelId || !prospectingStatus || !urgency) {
    return TASK_CREATE_REQUIRED_FIELDS_MESSAGE;
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

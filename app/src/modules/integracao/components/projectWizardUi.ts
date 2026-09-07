import type { ProjectWizardTask, ProjectWizardTaskProposal, TaskModel } from "../types";
import { getAutomaticTaskResponsibleId } from "./taskFormModalUi.ts";

export const WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING = "Prazo fora do período do projeto.";

/**
 * Trocar departamento ou Modelo derruba as seleções que deixaram de ser compatíveis; editar o
 * prazo derruba o aviso da IA sobre ele.
 */
export function applyWizardTaskChange<T extends ProjectWizardTaskProposal>(
  task: T,
  field: keyof ProjectWizardTask,
  value: string,
  taskModels: TaskModel[],
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
  task: Pick<ProjectWizardTaskProposal, "prevision_date" | "prevision_date_warning">,
  startDate: string,
  endDate?: string | null,
): string | null {
  if (!task.prevision_date) return task.prevision_date_warning ?? null;

  return task.prevision_date < startDate || (endDate ? task.prevision_date > endDate : false)
    ? WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING
    : null;
}

import type { TaskModel } from "../types";

export const TASK_MODEL_TABLE_CLASSNAME = "min-w-[720px] w-full table-fixed";
export const TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME = "text-left";
export const TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME = "w-[52%]";
export const TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME = "w-[32%]";
export const TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME = "w-24";

interface GetTaskModelEmptyStateMessageParams {
  hasSearch: boolean;
  isError: boolean;
}

export function getTaskModelEmptyStateMessage({
  hasSearch,
  isError,
}: GetTaskModelEmptyStateMessageParams): string {
  if (isError) {
    return "Não foi possível carregar os modelos.";
  }

  return hasSearch ? "Nenhum modelo encontrado para a busca." : "Nenhum modelo cadastrado.";
}

export function getTaskModelDepartmentLabel(
  model: Pick<TaskModel, "department" | "department_id">,
): string {
  return model.department?.name?.trim() || "Departamento não carregado";
}

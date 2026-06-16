import type { TaskModel } from "../types";

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

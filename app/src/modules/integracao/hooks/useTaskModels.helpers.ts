import type { TaskModel } from "../types";

export type TaskModelDepartment = {
  id: string;
  name: string;
};

type TaskModelListSource = Pick<TaskModel, "id" | "department_id" | "name" | "department">;

export function enrichTaskModelsWithDepartments(
  models: TaskModelListSource[],
  departments: TaskModelDepartment[],
): TaskModel[] {
  const departmentById = new Map(departments.map((department) => [department.id, department]));

  return models.map((model) => {
    const department = departmentById.get(model.department_id);

    return {
      ...model,
      ...(department || model.department
        ? {
            department: {
              id: department?.id ?? model.department?.id ?? model.department_id,
              name: department?.name ?? model.department?.name ?? "",
            },
          }
        : {}),
    };
  });
}

interface FetchTaskModelsWithOptionalDepartmentsParams {
  listModels: () => Promise<TaskModelListSource[]>;
  listDepartments: () => Promise<TaskModelDepartment[]>;
  onDepartmentError?: (error: unknown) => void;
}

export async function fetchTaskModelsWithOptionalDepartments({
  listModels,
  listDepartments,
  onDepartmentError,
}: FetchTaskModelsWithOptionalDepartmentsParams): Promise<TaskModel[]> {
  const models = await listModels();

  try {
    const departments = await listDepartments();
    return enrichTaskModelsWithDepartments(models, departments);
  } catch (error) {
    onDepartmentError?.(error);
    return enrichTaskModelsWithDepartments(models, []);
  }
}

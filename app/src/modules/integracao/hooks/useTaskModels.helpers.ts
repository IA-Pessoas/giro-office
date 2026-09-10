import type { TaskModel } from "../types";

export type TaskModelDepartment = {
  id: string;
  name: string;
};

type TaskModelWithDepartment = Pick<TaskModel, "id" | "department_id" | "name"> & {
  department?: TaskModelDepartment;
};

export function enrichTaskModelsWithDepartments(
  models: Array<Pick<TaskModel, "id" | "department_id" | "name">>,
  departments: TaskModelDepartment[],
): TaskModelWithDepartment[] {
  const departmentById = new Map(departments.map((department) => [department.id, department]));

  return models.map((model) => {
    const department = departmentById.get(model.department_id);

    return {
      ...model,
      ...(department
        ? {
            department: {
              id: department.id,
              name: department.name,
            },
          }
        : {}),
    };
  });
}

interface FetchTaskModelsWithOptionalDepartmentsParams {
  listModels: () => Promise<Array<Pick<TaskModel, "id" | "department_id" | "name">>>;
  listDepartments: () => Promise<TaskModelDepartment[]>;
  onDepartmentError?: (error: unknown) => void;
}

export async function fetchTaskModelsWithOptionalDepartments({
  listModels,
  listDepartments,
  onDepartmentError,
}: FetchTaskModelsWithOptionalDepartmentsParams): Promise<TaskModelWithDepartment[]> {
  const models = await listModels();

  try {
    const departments = await listDepartments();
    return enrichTaskModelsWithDepartments(models, departments);
  } catch (error) {
    onDepartmentError?.(error);
    return enrichTaskModelsWithDepartments(models, []);
  }
}

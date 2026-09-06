import type { IntegracaoTaskListParams, ProjectListParams, TaskModelListParams } from "../types";

export const PROJECTS_QUERY_KEY = ["projects"] as const;
export const TASK_MODELS_QUERY_KEY = ["task-models"] as const;
export const INTEGRACAO_TASKS_QUERY_KEY = ["integracao-tasks"] as const;

export function projectListQueryKey(params: ProjectListParams) {
  return [...PROJECTS_QUERY_KEY, "list", params.ref, params.id] as const;
}

export function projectMetricsQueryKey() {
  return [...PROJECTS_QUERY_KEY, "metrics"] as const;
}

export function projectDetailQueryKey(projectId: string) {
  return [...PROJECTS_QUERY_KEY, "detail", projectId] as const;
}

export function taskModelsListQueryKey(params: TaskModelListParams = {}) {
  return [
    ...TASK_MODELS_QUERY_KEY,
    "list",
    params.type ?? "",
    params.billing ?? "",
    params.search ?? "",
    params.page ?? 1,
    params.limit ?? 20,
  ] as const;
}

export function integracaoTasksListQueryKey(params: IntegracaoTaskListParams) {
  return [
    ...INTEGRACAO_TASKS_QUERY_KEY,
    "list",
    params.status ?? "Todos",
    params.ref ?? "",
    params.search ?? "",
    params.clientId ?? null,
    params.assignment ?? "",
    params.page ?? 1,
    params.limit ?? 20,
  ] as const;
}

export function integracaoTaskDetailQueryKey(taskId: string) {
  return [...INTEGRACAO_TASKS_QUERY_KEY, "detail", taskId] as const;
}

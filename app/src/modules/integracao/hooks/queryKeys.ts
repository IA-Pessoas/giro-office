import type { ProjectListParams } from "../types";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

export function projectListQueryKey(params: ProjectListParams) {
  return [...PROJECTS_QUERY_KEY, "list", params.ref, params.id] as const;
}

export function projectDetailQueryKey(projectId: string) {
  return [...PROJECTS_QUERY_KEY, "detail", projectId] as const;
}

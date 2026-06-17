import type {
  CreateProjectData,
  DeleteProjectData,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectProgressResponse,
} from "../types";
import { unwrapServiceEnvelope } from "./envelope.contract.js";

export const PROJECT_ENDPOINTS = {
  list: "/project/list",
  crud: "/project",
  progress: "/project/progress",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildProjectListParams(params: ProjectListParams) {
  return params;
}

export function buildCreateProjectPayload(payload: CreateProjectData) {
  return {
    client_id: payload.client_id,
    name: payload.name,
    start_date: payload.start_date,
    objective: payload.objective,
    ...(payload.end_date ? { end_date: payload.end_date } : {}),
  };
}

export function buildDeleteProjectPayload(projectId: string): DeleteProjectData {
  return { project_id: projectId };
}

export function unwrapProjectEnvelope<T>(body: unknown): T {
  return unwrapServiceEnvelope(body) as T;
}

export function unwrapProjectList(body: unknown): ProjectListItem[] {
  return unwrapProjectEnvelope<ProjectListItem[]>(body);
}

export function unwrapCreatedProject(body: unknown): ProjectListItem {
  const data = unwrapProjectEnvelope<{ create?: ProjectListItem } | ProjectListItem>(body);

  if (isRecord(data) && "create" in data) {
    return data.create as ProjectListItem;
  }

  return data as ProjectListItem;
}

export function unwrapProjectDetail(body: unknown): ProjectDetail {
  const data = unwrapProjectEnvelope<{ detail?: ProjectDetail } | ProjectDetail>(body);

  if (isRecord(data) && "detail" in data) {
    return data.detail as ProjectDetail;
  }

  return data as ProjectDetail;
}

export function unwrapUpdatedProject(body: unknown): ProjectDetail {
  return unwrapProjectEnvelope<ProjectDetail>(body);
}

export function unwrapProjectProgress(body: unknown): ProjectProgressResponse {
  const data = unwrapProjectEnvelope<{ project?: ProjectProgressResponse } | ProjectProgressResponse>(
    body,
  );

  if (isRecord(data) && "project" in data) {
    return data.project as ProjectProgressResponse;
  }

  return data as ProjectProgressResponse;
}

import type {
  CreateProjectData,
  DeleteProjectData,
  ExtractProjectTasksData,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectMetrics,
  ProjectProgressResponse,
  ProjectWizardResult,
  ProjectWizardTask,
} from "../types";
import { unwrapServiceEnvelope } from "./envelope.contract.js";

export const PROJECT_ENDPOINTS = {
  list: "/project/list",
  crud: "/project",
  progress: "/project/progress",
  metrics: "/project/metrics",
  wizard: "/task/project-wizard",
  wizardExtractTasks: "/task/project-wizard/extract-tasks",
} as const;

export const PROJECT_TASK_EXTRACTION_FAILURE_MESSAGE =
  "Não foi possível extrair tarefas da Ata. Revise o conteúdo ou cadastre as tarefas manualmente.";

export const PROJECT_DELETE_ADMIN_MESSAGE =
  "Somente usuários com permissão administrativa na Integração podem excluir projetos.";
const PROJECT_DELETE_FALLBACK_MESSAGE = "Não foi possível excluir o projeto.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(data: Record<string, unknown> | undefined, key: "error" | "message") {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function getProjectDeleteErrorMessage(error: unknown): string {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: Record<string, unknown>;
      };
    }
  ).response;

  if (response?.status === 403) {
    return PROJECT_DELETE_ADMIN_MESSAGE;
  }

  if (response?.status === 409) {
    return (
      getStringField(response.data, "error") ??
      getStringField(response.data, "message") ??
      PROJECT_DELETE_FALLBACK_MESSAGE
    );
  }

  return PROJECT_DELETE_FALLBACK_MESSAGE;
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

export function buildExtractProjectTasksPayload(payload: ExtractProjectTasksData) {
  return {
    content: payload.content.trim(),
    name: payload.name,
    objective: payload.objective,
    start_date: payload.start_date,
    ...(payload.end_date ? { end_date: payload.end_date } : {}),
  };
}

export function unwrapProjectTaskProposals(body: unknown): ProjectWizardTask[] {
  const data = unwrapProjectEnvelope<{ tasks?: unknown }>(body);
  const tasks = isRecord(data) ? data.tasks : undefined;

  const proposals = (Array.isArray(tasks) ? tasks : [])
    .filter(isRecord)
    .filter((task) => typeof task.name === "string" && task.name.trim())
    .map((task) => ({
      name: String(task.name).trim(),
      prevision_date: typeof task.prevision_date === "string" ? task.prevision_date : undefined,
      department_id: typeof task.department_id === "string" ? task.department_id : "",
      model_id: typeof task.model_id === "string" ? task.model_id : "",
      responsible_id: null,
    }));

  if (proposals.length === 0) {
    throw new Error(PROJECT_TASK_EXTRACTION_FAILURE_MESSAGE);
  }

  return proposals;
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

export function unwrapProjectWizardResult(body: unknown): ProjectWizardResult {
  return unwrapProjectEnvelope<ProjectWizardResult>(body);
}


export function unwrapProjectMetrics(body: unknown): ProjectMetrics {
  return unwrapProjectEnvelope<ProjectMetrics>(body);
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

import { setupAPIClient } from "@shared/services/api";

import type {
  CreateProjectData,
  CreateProjectWizardData,
  ExtractProjectTasksData,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectMetrics,
  ProjectProgressResponse,
  ProjectWizardPreview,
  ProjectWizardResult,
  ProjectWizardTask,
  ProjectWizardTaskProposal,
  UpdateProjectData,
} from "../types";
import {
  buildCreateProjectPayload,
  buildDeleteProjectPayload,
  buildExtractProjectTasksPayload,
  buildProjectListParams,
  PROJECT_ENDPOINTS,
  unwrapCreatedProject,
  unwrapProjectDetail,
  unwrapProjectList,
  unwrapProjectMetrics,
  unwrapProjectProgress,
  unwrapUpdatedProject,
  unwrapProjectTaskProposals,
  unwrapProjectWizardResult,
  unwrapProjectWizardPreview,
} from "./projectService.contract";

export const projectService = {
  async list(params: ProjectListParams): Promise<ProjectListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(PROJECT_ENDPOINTS.list, {
      params: buildProjectListParams(params),
    });

    return unwrapProjectList(response.data);
  },

  async metrics(): Promise<ProjectMetrics> {
    const api = setupAPIClient();
    const response = await api.get(PROJECT_ENDPOINTS.metrics);

    return unwrapProjectMetrics(response.data);
  },

  async detail(projectId: string): Promise<ProjectDetail> {
    const api = setupAPIClient();
    const response = await api.get(PROJECT_ENDPOINTS.crud, {
      params: { project_id: projectId },
    });

    return unwrapProjectDetail(response.data);
  },

  async create(payload: CreateProjectData): Promise<ProjectListItem> {
    const api = setupAPIClient();
    const response = await api.post(PROJECT_ENDPOINTS.crud, buildCreateProjectPayload(payload));

    return unwrapCreatedProject(response.data);
  },

  async createWithWizard(payload: CreateProjectWizardData): Promise<ProjectWizardResult> {
    const api = setupAPIClient();
    const { idempotencyKey, revision, tasks, ...data } = payload;
    const response = await api.post(
      PROJECT_ENDPOINTS.wizard,
      {
        ...buildCreateProjectPayload(data),
        ...(tasks !== undefined ? { tasks } : {}),
        revision,
      },
      { headers: { "Idempotency-Key": idempotencyKey } },
    );

    return unwrapProjectWizardResult(response.data);
  },

  async extractTasks(payload: ExtractProjectTasksData): Promise<ProjectWizardTaskProposal[]> {
    // O wizard mostra a falha no próprio modal; o toast genérico de 5xx duplicaria o aviso.
    const api = setupAPIClient(undefined, undefined, undefined, { notifyServerErrors: false });
    const response = await api.post(
      PROJECT_ENDPOINTS.wizardExtractTasks,
      buildExtractProjectTasksPayload(payload),
    );

    return unwrapProjectTaskProposals(response.data);
  },

  async previewWizard(tasks: ProjectWizardTask[]): Promise<ProjectWizardPreview> {
    const api = setupAPIClient();
    const response = await api.post(PROJECT_ENDPOINTS.wizardPreview, { tasks });

    return unwrapProjectWizardPreview(response.data);
  },

  async update(payload: UpdateProjectData): Promise<ProjectDetail> {
    const api = setupAPIClient();
    const response = await api.put(PROJECT_ENDPOINTS.crud, payload);

    return unwrapUpdatedProject(response.data);
  },

  async delete(projectId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(PROJECT_ENDPOINTS.crud, { data: buildDeleteProjectPayload(projectId) });
  },

  async recalculateProgress(projectId: string): Promise<ProjectProgressResponse> {
    const api = setupAPIClient();
    const response = await api.post(PROJECT_ENDPOINTS.progress, { project_id: projectId });

    return unwrapProjectProgress(response.data);
  },
};

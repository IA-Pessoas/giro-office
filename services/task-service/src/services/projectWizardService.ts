import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "@workspace/shared";
import { INTEGRACAO_TASK_STATUS_TODO } from "../constants/integracaoTask.js";
import { PROSPECTING_STATUS_CLOSED } from "../constants/prospectingStatus.js";
import type {
  CreatedProject,
  CreateProjectFromWizardParams,
  ProjectWizardIntegration,
} from "../integrations/projectWizard.js";
import { createHttpProjectWizardIntegration } from "../integrations/projectWizard.js";
import { type CreateTaskCrudRequest, TaskCrudService } from "./taskCrudService.js";

export interface ProjectWizardTask {
  name: string;
  department_id: string;
  model_id: string;
  prevision_date?: string;
  responsible_id?: string | null;
}

export interface CreateProjectWizardRequest extends CreateProjectFromWizardParams {
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
  tasks: ProjectWizardTask[];
}

export class ProjectWizardService {
  constructor(
    private readonly projectIntegration: ProjectWizardIntegration = createHttpProjectWizardIntegration(),
    private readonly taskService: {
      createTask(data: CreateTaskCrudRequest): Promise<{
        create: { responsible_id: string | null };
      }>;
    } = new TaskCrudService(),
  ) {}

  async create(data: CreateProjectWizardRequest): Promise<{
    project: CreatedProject;
    counts: { main: number; dependencies: 0; unassigned: number };
  }> {
    requireIntegracaoRouteAccess("POST", "/task/project-wizard", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
      requestedFields: ["name", "client_id", "start_date", "end_date", "objective"],
    });

    const project = await this.projectIntegration.createProject(data);
    const createdTasks = [];

    for (const task of data.tasks) {
      const result = await this.taskService.createTask({
        user_id: data.userId,
        organization_id: data.organizationId,
        model_id: task.model_id,
        project_id: project.id,
        client_id: data.client_id,
        prospecting_status: PROSPECTING_STATUS_CLOSED,
        name: task.name,
        status: INTEGRACAO_TASK_STATUS_TODO,
        department_id: task.department_id,
        observations: "",
        urgency: "",
        responsible_id: task.responsible_id,
        prevision_date: task.prevision_date,
        integracaoLevel: data.integracaoLevel,
        isOwner: data.isOwner === true,
        createDependencies: false,
      });
      createdTasks.push(result.create);
    }

    return {
      project,
      counts: {
        main: createdTasks.length,
        dependencies: 0,
        unassigned: createdTasks.filter(({ responsible_id }) => responsible_id === null).length,
      },
    };
  }
}

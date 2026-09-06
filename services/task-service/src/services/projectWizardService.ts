import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "@workspace/shared";
import type {
  CreateProjectFromWizardParams,
  ProjectWizardIntegration,
} from "../integrations/projectWizard.js";
import { createHttpProjectWizardIntegration } from "../integrations/projectWizard.js";

export interface CreateProjectWizardRequest extends CreateProjectFromWizardParams {
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export class ProjectWizardService {
  constructor(
    private readonly projectIntegration: ProjectWizardIntegration = createHttpProjectWizardIntegration(),
  ) {}

  async create(data: CreateProjectWizardRequest): Promise<{
    project: Record<string, unknown>;
    counts: { main: 0; dependencies: 0; unassigned: 0 };
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

    return { project, counts: { main: 0, dependencies: 0, unassigned: 0 } };
  }
}

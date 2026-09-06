import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "@workspace/shared";

import {
  createHttpProjectWizardIntegration,
  type ProjectWizardIntegration,
} from "../integrations/projectWizard.js";

export interface CreateProjectWizardRequest {
  userId: string;
  organizationId: string;
  permission?: number;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
  userType?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
  idempotencyKey: string;
  client_id: string;
  name: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
}

export class ProjectWizardService {
  constructor(
    private readonly projectIntegration: ProjectWizardIntegration = createHttpProjectWizardIntegration(),
  ) {}

  async create(data: CreateProjectWizardRequest): Promise<{
    project: Record<string, unknown>;
    counters: { main: 0; dependencies: 0; unassigned: 0 };
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

    return { project, counters: { main: 0, dependencies: 0, unassigned: 0 } };
  }
}

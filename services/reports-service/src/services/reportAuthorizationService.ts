import { ServiceError } from "@workspace/shared";
import {
  deriveReportCatalogGrant,
  type ReportCatalogGrant,
  type ReportCatalogScope,
} from "../catalog/types.js";
import {
  getReportingAccessContext,
  getReportingCatalogScope,
  type ReportingAccessContextClient,
} from "../routes/reportingContext.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type {
  ReportDefinitionService,
  ValidatedReportDefinition,
} from "./reportDefinitionService.js";

export interface ValidateReportDefinitionInput {
  userId: string;
  organizationId: string;
  requestId: string;
  definition: ReportDefinition;
}

export interface AuthorizedSharedReportDefinition extends ValidatedReportDefinition {
  department_id: string;
  grant: ReportCatalogGrant;
}

export interface SharedDepartment {
  id: string;
  module: string;
}

export interface SharedExecutionContext {
  department: SharedDepartment;
  scope: ReportCatalogScope;
}

export class ReportAuthorizationService {
  constructor(
    private readonly accessContextClient: ReportingAccessContextClient,
    private readonly definitionService: ReportDefinitionService,
  ) {}

  async validateDefinition(
    input: ValidateReportDefinitionInput,
  ): Promise<ValidatedReportDefinition> {
    const scope = await getReportingCatalogScope(this.accessContextClient, input);
    return this.definitionService.validate(input.definition, scope);
  }

  async getSharedDepartment(
    input: Omit<ValidateReportDefinitionInput, "definition">,
  ): Promise<SharedDepartment> {
    const context = await getReportingAccessContext(this.accessContextClient, input);
    return this.requireSharedDepartment(context);
  }

  async getSharedExecutionContext(
    input: Omit<ValidateReportDefinitionInput, "definition">,
  ): Promise<SharedExecutionContext> {
    const context = await getReportingAccessContext(this.accessContextClient, input);
    return {
      department: this.requireSharedDepartment(context),
      scope: {
        organization_id: context.organization_id,
        modules: context.modules,
      },
    };
  }

  async authorizeSharedModel(
    input: ValidateReportDefinitionInput,
  ): Promise<AuthorizedSharedReportDefinition> {
    const context = await getReportingAccessContext(this.accessContextClient, input);
    const department = this.requireSharedDepartment(context);
    if ((context.modules[department.module] ?? 0) < 3) {
      throw new ServiceError(
        403,
        "A administração do modelo exige nível 3 no módulo do departamento.",
      );
    }

    const validated = this.definitionService.validate(input.definition, {
      organization_id: context.organization_id,
      modules: context.modules,
    });
    return {
      ...validated,
      department_id: department.id,
      grant: deriveReportCatalogGrant(validated.definition),
    };
  }

  async validateSharedDefinition(
    input: ValidateReportDefinitionInput,
  ): Promise<AuthorizedSharedReportDefinition> {
    const execution = await this.getSharedExecutionContext(input);
    const definition = this.definitionService.validate(input.definition, {
      ...execution.scope,
      grant: deriveReportCatalogGrant(input.definition),
    });
    return {
      ...definition,
      department_id: execution.department.id,
      grant: deriveReportCatalogGrant(definition.definition),
    };
  }

  private requireSharedDepartment(context: {
    department: { id: string } | null;
    departmentModule: string | null;
  }): SharedDepartment {
    if (!context.department || !context.departmentModule) {
      throw new ServiceError(
        403,
        "O acervo compartilhado não está disponível para o departamento atual.",
      );
    }
    return { id: context.department.id, module: context.departmentModule };
  }
}

import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import {
  getReportingCatalogScope,
  type ReportingAccessContextClient,
} from "../routes/reportingContext.js";
import {
  type ReportDefinitionService,
  type ValidatedReportDefinition,
} from "./reportDefinitionService.js";

export interface ValidateReportDefinitionInput {
  userId: string;
  organizationId: string;
  requestId: string;
  definition: ReportDefinition;
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
}

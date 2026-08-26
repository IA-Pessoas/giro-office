import { ServiceError } from "@workspace/shared";

import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportCatalogScope } from "../catalog/types.js";
import { MAX_SNAPSHOT_ROWS } from "../schemas/reportSnapshot.schemas.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { ReportDefinitionService } from "./reportDefinitionService.js";

export class ReportExecutionService {
  constructor(
    private readonly catalog: SourceCatalogService,
    private readonly definitions: ReportDefinitionService,
  ) {}

  async execute(input: {
    definition: ReportDefinition;
    scope: ReportCatalogScope;
    parameterValues: Readonly<Record<string, unknown>>;
    requestId: string;
  }): Promise<readonly Record<string, unknown>[]> {
    const validated = this.definitions.validate(input.definition, input.scope);
    const adapter = this.catalog.findAdapterForSources(validated.definition.sources, input.scope);
    if (!adapter)
      throw new ServiceError(403, "Nenhum adaptador autorizado pode executar este relatório.");
    const rows = await adapter.preview({
      definition: validated.definition,
      parameter_values: input.parameterValues,
      organization_id: input.scope.organization_id,
      limit: MAX_SNAPSHOT_ROWS + 1,
      request_id: input.requestId,
    });
    if (rows.length > MAX_SNAPSHOT_ROWS) {
      throw new ServiceError(400, "O resultado excede o limite de linhas do snapshot.");
    }
    return rows;
  }
}

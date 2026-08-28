import { ServiceError } from "@workspace/shared";

import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportCatalogScope } from "../catalog/types.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { ReportDefinitionService } from "./reportDefinitionService.js";

export class ReportPreviewService {
  constructor(
    private readonly sourceCatalog: SourceCatalogService,
    private readonly definitionService: ReportDefinitionService,
    private readonly previewRowLimit: number,
  ) {}

  async preview(
    definition: ReportDefinition,
    scope: ReportCatalogScope,
    requestId = "reports-preview",
    parameterValues?: Readonly<Record<string, unknown>>,
  ): Promise<{
    rows: readonly Record<string, unknown>[];
    presentation: {
      columns: readonly { key: string; label: string }[];
    };
    limit: number;
    hasMore: boolean;
  }> {
    const validated = this.definitionService.validate(definition, scope);
    const adapter = this.sourceCatalog.findAdapterForSources(definition.sources, scope);
    if (!adapter) {
      throw new ServiceError(403, "Nenhum adaptador autorizado pode executar este relatório.");
    }
    const rows = await adapter.preview({
      definition: validated.definition,
      parameter_values: parameterValues,
      organization_id: scope.organization_id,
      limit: this.previewRowLimit + 1,
      request_id: requestId,
    });
    return {
      rows: rows.slice(0, this.previewRowLimit),
      presentation: {
        columns: validated.definition.columns.map((column) => ({
          key: column.alias,
          label: column.alias,
        })),
      },
      limit: this.previewRowLimit,
      hasMore: rows.length > this.previewRowLimit,
    };
  }
}

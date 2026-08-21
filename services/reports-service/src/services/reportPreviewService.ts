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
  ): Promise<{
    rows: readonly Record<string, unknown>[];
    hasMore: boolean;
  }> {
    const validated = this.definitionService.validate(definition, scope);
    const adapter = this.sourceCatalog.findAdapterForSources(definition.sources, scope);
    if (!adapter) {
      throw new ServiceError(403, "Nenhum adaptador autorizado pode executar este relatório.");
    }
    const rows = await adapter.preview({
      definition: validated.definition,
      organization_id: scope.organization_id,
      limit: this.previewRowLimit + 1,
    });
    return {
      rows: rows.slice(0, this.previewRowLimit),
      hasMore: rows.length > this.previewRowLimit,
    };
  }
}

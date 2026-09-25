import { ServiceError } from "@workspace/shared";
import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { normalizeReportPreviewAdapterOutput, type ReportCatalogScope } from "../catalog/types.js";
import { reportAggregationAlias } from "../integrations/reportCriteria.js";
import type { ReportComposition } from "../schemas/reportComposition.schemas.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { ReportDefinitionService } from "./reportDefinitionService.js";
import { v3Columns, v3Rows } from "./reportV3Presentation.js";

export class ReportPreviewService {
  constructor(
    private readonly sourceCatalog: SourceCatalogService,
    private readonly definitionService: ReportDefinitionService,
    private readonly previewRowLimit: number,
  ) {}

  async previewComposition(
    definition: ReportComposition,
    scope: ReportCatalogScope,
    requestId = "reports-preview",
  ): Promise<{
    blocks: Array<
      { source: string; label: string } & Awaited<ReturnType<ReportPreviewService["preview"]>>
    >;
  }> {
    if (definition.version === 3) {
      const prepared = definition.areas.map((area) =>
        this.definitionService.prepareV3Area(area, scope),
      );
      const catalog = this.sourceCatalog.getAuthorizedCatalog(scope);
      const blocks = [];
      for (const [index, area] of definition.areas.entries()) {
        const source = catalog.sources.find((item) => item.key === area.source);
        if (!source) throw new ServiceError(403, "Confira as áreas disponíveis para seu acesso.");
        const result = await this.preview(
          prepared[index].definition,
          scope,
          requestId,
          prepared[index].parameterValues,
        );
        blocks.push({
          ...result,
          source: area.source,
          label: source.label,
          layout: area.layout,
          dimensions: area.dimensions,
          presentation: { columns: v3Columns(area, source) },
          rows: v3Rows(area, result.rows),
        });
      }
      return { blocks };
    }
    const prepared = definition.areas.map((area) =>
      this.definitionService.prepareArea(area, scope),
    );
    const catalog = this.sourceCatalog.getAuthorizedCatalog(scope);
    const blocks = [];
    for (const [index, area] of definition.areas.entries()) {
      const source = catalog.sources.find((item) => item.key === area.source);
      if (!source) throw new ServiceError(403, "Confira as áreas disponíveis para seu acesso.");
      const result = await this.preview(
        prepared[index].definition,
        scope,
        requestId,
        prepared[index].parameterValues,
      );
      const summaries: Record<string, string> = {
        count: "Contagem",
        sum: "Soma",
        avg: "Média",
        min: "Mínimo",
        max: "Máximo",
      };
      const columns = result.presentation.columns.map((column) => {
        const aggregation = prepared[index].definition.aggregations.find(
          (item) => reportAggregationAlias(item) === column.key,
        );
        const field = source.fields.find((item) => item.key === (aggregation?.field ?? column.key));
        return {
          key: column.key,
          label: aggregation
            ? `${summaries[aggregation.function]} de ${field?.label}`
            : (field?.label ?? "Campo"),
        };
      });
      blocks.push({
        ...result,
        source: area.source,
        label: source.label,
        presentation: { columns },
        rows: result.rows.map((row) =>
          Object.fromEntries(columns.map(({ key }) => [key, row[key]])),
        ),
      });
    }
    return { blocks };
  }

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
    const result = normalizeReportPreviewAdapterOutput(
      await adapter.preview({
        definition: validated.definition,
        parameter_values: parameterValues,
        organization_id: scope.organization_id,
        limit: this.previewRowLimit + 1,
        request_id: requestId,
      }),
    );
    return {
      rows: result.rows.slice(0, this.previewRowLimit),
      presentation: {
        columns:
          definition.group_by?.length || definition.aggregations.length
            ? [
                ...(definition.group_by ?? []).map(({ field }) => field),
                ...definition.aggregations.map(reportAggregationAlias),
              ].map((key) => ({ key, label: key }))
            : validated.definition.columns.map((column) => ({
                key: column.alias,
                label: column.alias,
              })),
      },
      limit: this.previewRowLimit,
      hasMore: result.reachedLimit || result.rows.length > this.previewRowLimit,
    };
  }
}

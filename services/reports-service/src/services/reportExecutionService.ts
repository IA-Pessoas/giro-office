import { MAX_REPORTING_QUERY_LIMIT, ServiceError } from "@workspace/shared";

import type { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { normalizeReportPreviewAdapterOutput, type ReportCatalogScope } from "../catalog/types.js";
import { reportAggregationAlias } from "../integrations/reportCriteria.js";
import type { ReportComposition } from "../schemas/reportComposition.schemas.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import { MAX_SNAPSHOT_ROWS } from "../schemas/reportSnapshot.schemas.js";
import type { ReportDefinitionService } from "./reportDefinitionService.js";

export type ReportResultColumn = { key: string; label: string };
export type ReportResultBlock = {
  source: string;
  label: string;
  columns: readonly ReportResultColumn[];
  rows: readonly Record<string, unknown>[];
};

export class ReportAreaExecutionError extends Error {
  readonly userMessage: string;

  constructor(
    readonly source: string,
    readonly label: string,
    cause: unknown,
  ) {
    super(
      `Não foi possível gerar o bloco ${label}. Confira o acesso e os critérios e tente novamente.`,
    );
    this.name = "ReportAreaExecutionError";
    this.userMessage = this.message;
    Object.assign(this, { cause });
  }
}

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
    const result = await this.executeDefinition({
      definition: validated.definition,
      scope: input.scope,
      parameterValues: input.parameterValues,
      requestId: input.requestId,
      limit: MAX_REPORTING_QUERY_LIMIT,
    });
    if (result.reachedLimit) {
      throw new ServiceError(400, "A origem excedeu seu limite de linhas para o snapshot.");
    }
    if (result.rows.length > MAX_SNAPSHOT_ROWS) {
      throw new ServiceError(400, "O resultado excede o limite de linhas do snapshot.");
    }
    return result.rows;
  }

  assertAuthorizedDefinition(input: {
    definition: ReportDefinition | ReportComposition;
    scope: ReportCatalogScope;
  }): void {
    if ("version" in input.definition) {
      this.definitions.validateComposition(input.definition, input.scope);
      return;
    }
    this.definitions.validate(input.definition, input.scope);
  }

  async executeComposition(input: {
    definition: ReportComposition;
    scope: ReportCatalogScope;
    requestId: string;
  }): Promise<{ blocks: readonly ReportResultBlock[] }> {
    const catalog = this.catalog.getAuthorizedCatalog(input.scope);
    const prepared = input.definition.areas.map((area) => {
      const source = catalog.sources.find((item) => item.key === area.source);
      if (!source) {
        throw new ReportAreaExecutionError(
          area.source,
          "Área selecionada",
          new ServiceError(403, "Área não autorizada."),
        );
      }
      try {
        return { area, source, prepared: this.definitions.prepareArea(area, input.scope) };
      } catch (cause) {
        throw new ReportAreaExecutionError(area.source, source.label, cause);
      }
    });

    const blocks: ReportResultBlock[] = [];
    let remaining = MAX_SNAPSHOT_ROWS;
    for (const item of prepared) {
      try {
        const result = await this.executeDefinition({
          definition: item.prepared.definition,
          scope: input.scope,
          parameterValues: item.prepared.parameterValues,
          requestId: input.requestId,
          limit: remaining + 1,
        });
        if (result.reachedLimit || result.rows.length > remaining) {
          throw new ServiceError(400, "O resultado excede o limite de linhas do snapshot.");
        }
        const columns = this.presentationColumns(item.prepared.definition, item.source);
        blocks.push({
          source: item.area.source,
          label: item.source.label,
          columns,
          rows: result.rows.map((row) =>
            Object.fromEntries(columns.map(({ key }) => [key, row[key]])),
          ),
        });
        remaining -= result.rows.length;
      } catch (cause) {
        if (cause instanceof ReportAreaExecutionError) throw cause;
        throw new ReportAreaExecutionError(item.area.source, item.source.label, cause);
      }
    }
    return { blocks };
  }

  private async executeDefinition(input: {
    definition: ReportDefinition;
    scope: ReportCatalogScope;
    parameterValues: Readonly<Record<string, unknown>>;
    requestId: string;
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const validated = this.definitions.validate(input.definition, input.scope);
    const adapter = this.catalog.findAdapterForSources(validated.definition.sources, input.scope);
    if (!adapter)
      throw new ServiceError(403, "Nenhum adaptador autorizado pode executar este relatório.");
    const result = normalizeReportPreviewAdapterOutput(
      await adapter.preview({
        definition: validated.definition,
        parameter_values: input.parameterValues,
        organization_id: input.scope.organization_id,
        limit: input.limit,
        request_id: input.requestId,
      }),
    );
    return { rows: result.rows, reachedLimit: result.reachedLimit };
  }

  private presentationColumns(
    definition: ReportDefinition,
    source: { fields: readonly { key: string; label: string }[] },
  ): ReportResultColumn[] {
    const summaries: Record<string, string> = {
      count: "Contagem",
      sum: "Soma",
      avg: "Média",
      min: "Mínimo",
      max: "Máximo",
    };
    const keys =
      definition.group_by?.length || definition.aggregations.length
        ? [
            ...(definition.group_by ?? []).map(({ field }) => field),
            ...definition.aggregations.map(reportAggregationAlias),
          ]
        : definition.columns.map((column) => column.alias);
    return keys.map((key) => {
      const aggregation = definition.aggregations.find(
        (item) => reportAggregationAlias(item) === key,
      );
      const field = source.fields.find((item) => item.key === (aggregation?.field ?? key));
      return {
        key,
        label: aggregation
          ? `${summaries[aggregation.function]} de ${field?.label ?? "campo"}`
          : (field?.label ?? "Campo"),
      };
    });
  }
}

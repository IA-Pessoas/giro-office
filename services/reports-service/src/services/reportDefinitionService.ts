import { ServiceError } from "@workspace/shared";

import { RelationshipValidator } from "../catalog/relationshipValidator.js";
import type {
  AuthorizedReportCatalog,
  SourceCatalogService,
} from "../catalog/sourceCatalogService.js";
import type { ReportCatalogScope } from "../catalog/types.js";
import type { ReportComposition } from "../schemas/reportComposition.schemas.js";
import {
  MAX_DECLARED_REPORT_BYTES,
  MAX_DECLARED_REPORT_ROWS,
  type ReportDefinition,
} from "../schemas/reportDefinition.schemas.js";

export interface ValidatedReportDefinition {
  definition: ReportDefinition;
  catalog: AuthorizedReportCatalog;
}

export class ReportDefinitionService {
  readonly #relationshipValidator = new RelationshipValidator();

  constructor(private readonly sourceCatalog: SourceCatalogService) {}

  validateComposition(definition: ReportComposition, scope: ReportCatalogScope): ReportComposition {
    for (const area of definition.areas) {
      this.validate(
        {
          sources: [area.source],
          columns: area.fields.map((field) => ({ source: area.source, field, alias: field })),
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        scope,
      );
    }
    return definition;
  }

  validate(definition: ReportDefinition, scope: ReportCatalogScope): ValidatedReportDefinition {
    const catalog = this.sourceCatalog.getAuthorizedCatalog(scope);
    const sourceByKey = new Map(catalog.sources.map((source) => [source.key, source]));
    const sourceKeys = new Set(definition.sources);

    for (const source of sourceKeys) {
      if (!sourceByKey.has(source)) {
        throw new ServiceError(403, "A fonte não está autorizada para este relatório.");
      }
    }

    const findField = (sourceKey: string, fieldKey: string) => {
      if (!sourceKeys.has(sourceKey))
        throw new ServiceError(400, "O campo deve pertencer a uma área selecionada.");
      const source = sourceByKey.get(sourceKey);
      const field = source?.fields.find((candidate) => candidate.key === fieldKey);
      if (!field) throw new ServiceError(403, "O campo não está autorizado para este relatório.");
      return field;
    };

    for (const column of definition.columns) findField(column.source, column.field);

    const parameters = new Map(
      definition.parameters.map((parameter) => [parameter.name, parameter]),
    );
    for (const filter of definition.filters) {
      const field = findField(filter.source, filter.field);
      const parameter = parameters.get(filter.parameter);
      if (
        !field.filter_operators.includes(filter.operator) ||
        parameter?.type !== field.value_type
      ) {
        throw new ServiceError(400, "O predicado não é compatível com o campo publicado.");
      }
    }

    for (const aggregation of definition.aggregations) {
      const field = findField(aggregation.source, aggregation.field);
      if (!field.aggregations.includes(aggregation.function)) {
        throw new ServiceError(400, "A agregação não é compatível com o campo publicado.");
      }
    }

    for (const orderBy of definition.order_by) findField(orderBy.source, orderBy.field);
    for (const groupBy of definition.group_by ?? []) {
      if (!sourceKeys.has(groupBy.source))
        throw new ServiceError(400, "Agrupamento deve usar uma área selecionada.");
      findField(groupBy.source, groupBy.field);
    }

    if (
      definition.declared_cost &&
      (definition.declared_cost.rows > MAX_DECLARED_REPORT_ROWS ||
        definition.declared_cost.bytes > MAX_DECLARED_REPORT_BYTES)
    ) {
      throw new ServiceError(400, "O custo declarado excede o limite do relatório.");
    }

    this.#relationshipValidator.validate(definition.joins, sourceKeys, catalog);
    return { definition, catalog };
  }
}

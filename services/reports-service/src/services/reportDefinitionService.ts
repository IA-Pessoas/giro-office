import { ServiceError } from "@workspace/shared";
import { RelationshipValidator } from "../catalog/relationshipValidator.js";
import type {
  AuthorizedReportCatalog,
  SourceCatalogService,
} from "../catalog/sourceCatalogService.js";
import type { ReportCatalogScope } from "../catalog/types.js";
import { reportAggregationAlias, reportCriteria } from "../integrations/reportCriteria.js";
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
      this.prepareArea(area, scope);
    }
    return definition;
  }

  prepareArea(
    area: ReportComposition["areas"][number],
    scope: ReportCatalogScope,
  ): { definition: ReportDefinition; parameterValues: Record<string, unknown> } {
    const source = this.sourceCatalog
      .getAuthorizedCatalog(scope)
      .sources.find((item) => item.key === area.source);
    if (!source) throw new ServiceError(403, "Confira as áreas disponíveis para seu acesso.");
    const filters = area.filters ?? [];
    const publishedParameters = source.parameters ?? [];
    if (
      Object.keys(area.parameterValues ?? {}).some(
        (key) => !publishedParameters.some((parameter) => parameter.key === key),
      )
    )
      throw new ServiceError(400, "Confira os parâmetros disponíveis para esta área.");
    for (const parameter of publishedParameters) {
      const value = area.parameterValues?.[parameter.key];
      if (value === undefined || value === null || value === "") {
        if (parameter.required)
          throw new ServiceError(400, "Preencha os parâmetros obrigatórios da área.");
        continue;
      }
      const type =
        parameter.type === "text" || parameter.type === "select" ? "string" : parameter.type;
      if (
        (type === "date"
          ? typeof value !== "string" || !Number.isFinite(Date.parse(value))
          : typeof value !== type) ||
        (parameter.type === "select" &&
          !parameter.options?.some((option) => option.value === value))
      )
        throw new ServiceError(400, "Confira o tipo e as opções do parâmetro da área.");
    }
    const usedNames = new Set(publishedParameters.map((parameter) => parameter.key));
    const filterNames = filters.map((_, index) => {
      let suffix = index + 1;
      while (usedNames.has(`criterion_${suffix}`)) suffix++;
      const name = `criterion_${suffix}`;
      usedNames.add(name);
      return name;
    });
    for (const filter of filters) {
      const list = filter.operator === "in" || filter.operator === "between";
      if (
        list !== Array.isArray(filter.value) ||
        (Array.isArray(filter.value) &&
          (!filter.value.length || (filter.operator === "between" && filter.value.length !== 2)))
      )
        throw new ServiceError(
          400,
          "Confira os valores do critério: informe uma lista ou os dois extremos do intervalo.",
        );
    }
    const parameterValues = {
      ...area.parameterValues,
      ...Object.fromEntries(filters.map((filter, index) => [filterNames[index], filter.value])),
    };
    const definition: ReportDefinition = {
      sources: [area.source],
      columns: area.fields.map((field) => ({ source: area.source, field, alias: field })),
      joins: [],
      filters: filters.map((filter, index) => ({
        source: area.source,
        field: filter.field,
        operator: filter.operator,
        parameter: filterNames[index],
      })),
      filter_groups: filters.length
        ? [{ operator: area.filterLogic ?? "and", filters: filterNames }]
        : [],
      parameters: [
        ...publishedParameters
          .filter((parameter) => area.parameterValues?.[parameter.key] !== undefined)
          .map((parameter) => ({
            name: parameter.key,
            type:
              parameter.type === "text" || parameter.type === "select"
                ? ("string" as const)
                : parameter.type,
          })),
        ...filters.map((filter, index) => ({
          name: filterNames[index],
          type:
            source.fields.find((field) => field.key === filter.field)?.value_type ??
            ("string" as const),
        })),
      ],
      aggregations: (area.aggregations ?? []).map((item) => ({ ...item, source: area.source })),
      group_by: (area.groupBy ?? []).map((field) => ({ source: area.source, field })),
      order_by: (area.orderBy ?? []).map((item) => ({ ...item, source: area.source })),
    };
    this.validate(definition, scope);
    const groupBy = area.groupBy ?? [];
    if (
      groupBy.some((key) => source.fields.find((field) => field.key === key)?.groupable !== true) ||
      (area.orderBy ?? []).some(
        (item) => source.fields.find((field) => field.key === item.field)?.sortable !== true,
      )
    )
      throw new ServiceError(400, "Escolha campos com agrupamento e ordenação disponíveis.");
    const aliases = definition.aggregations.map(reportAggregationAlias);
    if (
      new Set(groupBy).size !== groupBy.length ||
      new Set(aliases).size !== aliases.length ||
      groupBy.some((key) => aliases.includes(key))
    )
      throw new ServiceError(400, "Escolha cada agrupamento ou resumo apenas uma vez.");
    if (
      (groupBy.length || aliases.length) &&
      (area.orderBy ?? []).some((item) => !groupBy.includes(item.field))
    )
      throw new ServiceError(400, "Ordene o resumo somente pelos campos agrupados.");
    reportCriteria(definition, parameterValues);
    return { definition, parameterValues };
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

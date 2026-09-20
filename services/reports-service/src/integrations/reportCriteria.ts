import { type ReportingQuery, reportingQueryFields, ServiceError } from "@workspace/shared";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";

export function reportAggregationAlias(
  aggregation: ReportDefinition["aggregations"][number],
): string {
  return aggregation.alias ?? `${aggregation.field}_${aggregation.function}`;
}

export function reportCriteria(
  definition: ReportDefinition,
  values?: Readonly<Record<string, unknown>>,
): { query?: ReportingQuery } {
  if (
    [
      ...definition.columns,
      ...definition.filters,
      ...definition.order_by,
      ...definition.aggregations,
      ...(definition.group_by ?? []),
    ].some((field) => field.source !== definition.sources[0])
  )
    throw new ServiceError(400, "Os critérios devem pertencer à área consultada.");
  for (const parameter of definition.parameters) {
    if (!values || !Object.getOwnPropertyDescriptor(values, parameter.name))
      throw new ServiceError(400, "Preencha os parâmetros obrigatórios do relatório.");
    const value = values[parameter.name];
    const items = Array.isArray(value) ? value : [value];
    if (
      items.some(
        (item) =>
          item !== null &&
          (parameter.type === "date"
            ? typeof item !== "string" || !Number.isFinite(Date.parse(item))
            : typeof item !== parameter.type ||
              (typeof item === "number" && !Number.isFinite(item))),
      )
    ) {
      throw new ServiceError(400, "O valor do parâmetro é incompatível com o tipo declarado.");
    }
  }
  if (
    !definition.filters.length &&
    !definition.order_by.length &&
    !definition.aggregations.length &&
    !definition.group_by?.length &&
    !definition.filter_groups.length
  )
    return {};
  return {
    query: {
      filters: definition.filters.map((filter) => {
        if (!values || !Object.getOwnPropertyDescriptor(values, filter.parameter))
          throw new ServiceError(400, "Preencha os parâmetros obrigatórios do relatório.");
        return {
          field: filter.field,
          operator: filter.operator,
          parameter: filter.parameter,
          value: values[filter.parameter],
        };
      }),
      filter_groups: definition.filter_groups,
      order_by: definition.order_by.map(({ field, direction }) => ({ field, direction })),
      group_by: definition.group_by?.map(({ field }) => field) ?? [],
      aggregations: definition.aggregations.map((aggregation) => ({
        field: aggregation.field,
        function: aggregation.function,
        alias: reportAggregationAlias(aggregation),
      })),
    },
  };
}

export { reportingQueryFields };

export function reportResultFields(
  fields: readonly string[],
  query?: ReportingQuery,
): readonly string[] {
  return query?.group_by?.length || query?.aggregations?.length
    ? [
        ...(query.group_by ?? []),
        ...(query.aggregations ?? []).map((aggregation) => aggregation.alias),
      ]
    : fields;
}

export function assertReportSourceResponse(response: { status: number }): void {
  if (response.status === 422)
    throw new ServiceError(422, "A área excede a capacidade de consulta do relatório.");
  if (response.status === 400)
    throw new ServiceError(400, "Os critérios não são compatíveis com esta área.");
  if (response.status === 403)
    throw new ServiceError(403, "A consulta não está autorizada para esta área.");
}

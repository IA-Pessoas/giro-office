import {
  MAX_REPORTING_QUERY_ROWS,
  projectReportingCatalog,
  type ReportingQuery,
  reportingAggregations,
  reportingQueryFields,
  reportingQuerySchema,
  ServiceError,
} from "@workspace/shared";

type Scalar = string | number | boolean | null;
type ReportingResult = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
};

const projectSource = projectReportingCatalog.sources[0];
const projectFields = [...projectSource.keys, ...projectSource.fields];
const projectMetadata = new Map(projectFields.map((field) => [field.key, field]));

export function getProjectReportingFields(
  source: (typeof projectReportingCatalog.sources)[number]["key"],
): readonly string[] {
  if (source !== projectSource.key) return [];
  return projectFields.map((field) => field.key);
}

function scalar(value: unknown, type: string): Scalar {
  if (value == null) return null;
  if (type === "date") {
    const millis = value instanceof Date ? value.getTime() : Date.parse(String(value));
    if (!Number.isFinite(millis)) throw new ServiceError(422, "A área contém uma data inválida.");
    return millis;
  }
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new ServiceError(422, "A área contém um número inválido.");
    return number;
  }
  return value as Scalar;
}

function compare(left: Scalar, right: Scalar): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function matchesFilter(actual: Scalar, operator: string, expected: Scalar | Scalar[]): boolean {
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "in") return (expected as Scalar[]).includes(actual);
  if (actual === null) return false;
  if (operator === "contains") return String(actual).includes(String(expected));
  if (operator === "between") {
    const [low, high] = expected as Scalar[];
    return compare(actual, low) >= 0 && compare(actual, high) <= 0;
  }
  const comparison = compare(actual, expected as Scalar);
  if (operator === "gt") return comparison > 0;
  if (operator === "gte") return comparison >= 0;
  if (operator === "lt") return comparison < 0;
  return comparison <= 0;
}

export async function executeProjectReportingQuery(
  input: { source: string; fields: readonly string[]; limit: number; query: ReportingQuery },
  load: (fields: readonly string[], limit: number, offset: number) => Promise<ReportingResult>,
): Promise<ReportingResult> {
  const parsed = reportingQuerySchema.safeParse(input.query);
  if (!parsed.success) throw new ServiceError(400, "Critérios de relatório inválidos.");
  const filters = input.query.filters ?? [];
  const orderBy = input.query.order_by ?? [];
  const groupBy = input.query.group_by ?? [];
  const aggregations = input.query.aggregations ?? [];
  const fields = reportingQueryFields(input.fields, input.query);
  if (input.source !== projectSource.key || fields.some((field) => !projectMetadata.has(field))) {
    throw new ServiceError(403, "Campo ou área não publicado para relatórios.");
  }
  const filterNames = new Set(filters.map((filter) => filter.parameter));
  if (
    filterNames.size !== filters.length ||
    (input.query.filter_groups ?? []).some((group) =>
      group.filters.some((name) => !filterNames.has(name)),
    )
  ) {
    throw new ServiceError(400, "Os grupos devem referenciar critérios únicos existentes.");
  }
  for (const filter of filters) {
    const field = projectMetadata.get(filter.field);
    if (!field?.filter_operators.includes(filter.operator))
      throw new ServiceError(400, "Operador não disponível para o campo.");
    const array = filter.operator === "in" || filter.operator === "between";
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (
      array !== Array.isArray(filter.value) ||
      (filter.operator === "between" && values.length !== 2) ||
      values.some((value) =>
        value === null
          ? !["eq", "neq", "in"].includes(filter.operator)
          : field.value_type === "date"
            ? typeof value !== "string" ||
              !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(value) ||
              !Number.isFinite(Date.parse(value))
            : typeof value !== field.value_type,
      )
    ) {
      throw new ServiceError(400, "O valor do parâmetro é incompatível com o campo.");
    }
  }
  const aliases = new Set(aggregations.map((aggregation) => aggregation.alias));
  if (
    aliases.size !== aggregations.length ||
    groupBy.some((field) => aliases.has(field)) ||
    new Set(groupBy).size !== groupBy.length
  ) {
    throw new ServiceError(400, "Aliases e agrupamentos devem ser únicos.");
  }
  for (const aggregation of aggregations) {
    if (
      aggregation.function !== "count_rows" &&
      !reportingAggregations(projectMetadata.get(aggregation.field)?.value_type ?? "").includes(
        aggregation.function,
      )
    ) {
      throw new ServiceError(400, "Resumo incompatível com o campo.");
    }
  }
  if (
    (groupBy.length || aggregations.length) &&
    orderBy.some((order) => !groupBy.includes(order.field))
  ) {
    throw new ServiceError(400, "Ordene o resumo somente pelos campos agrupados.");
  }

  const completeRows: Record<string, unknown>[] = [];
  let bytes = 0;
  for (let offset = 0; ; offset += 100) {
    const page = await load(fields, 100, offset);
    if (!page.rows.length && page.reachedLimit)
      throw new ServiceError(422, "A origem não conseguiu completar a consulta.");
    for (const row of page.rows) {
      bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if (bytes > 20 * 1024 * 1024 || completeRows.length >= MAX_REPORTING_QUERY_ROWS)
        throw new ServiceError(422, "O conjunto excede a capacidade de consulta do relatório.");
      completeRows.push(row);
    }
    if (!page.reachedLimit) break;
  }

  const groups = input.query.filter_groups ?? [];
  const grouped = new Set(groups.flatMap((group) => group.filters));
  let rows = completeRows.filter((row) => {
    const matches = new Map(
      filters.map((filter) => {
        const type = projectMetadata.get(filter.field)?.value_type ?? "string";
        const expected = Array.isArray(filter.value)
          ? filter.value.map((value) => scalar(value, type))
          : scalar(filter.value, type);
        return [
          filter.parameter,
          matchesFilter(scalar(row[filter.field], type), filter.operator, expected),
        ];
      }),
    );
    return (
      filters.every((filter) => grouped.has(filter.parameter) || matches.get(filter.parameter)) &&
      groups.every((group) =>
        group.operator === "or"
          ? group.filters.some((name) => matches.get(name))
          : group.filters.every((name) => matches.get(name)),
      )
    );
  });

  if (groupBy.length || aggregations.length) {
    const buckets = new Map<string, Record<string, unknown>[]>();
    if (!groupBy.length) buckets.set("[]", []);
    for (const row of rows) {
      const key = JSON.stringify(groupBy.map((field) => row[field] ?? null));
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
    rows = [...buckets.values()].map((bucket) => {
      const row: Record<string, unknown> = Object.fromEntries(
        groupBy.map((field) => [field, bucket[0]?.[field] ?? null]),
      );
      for (const aggregation of aggregations) {
        const values = bucket
          .map((item) => item[aggregation.field])
          .filter((value) => value != null);
        const type = projectMetadata.get(aggregation.field)?.value_type ?? "string";
        const sum =
          aggregation.function === "sum" || aggregation.function === "avg"
            ? values.reduce<number>((total, value) => total + Number(scalar(value, type)), 0)
            : 0;
        if (!Number.isFinite(sum))
          throw new ServiceError(422, "O resumo excede a capacidade numérica do relatório.");
        const extreme =
          aggregation.function === "min" || aggregation.function === "max"
            ? values.reduce((selected, value) => {
                const difference = compare(scalar(value, type), scalar(selected, type));
                return (aggregation.function === "min" ? difference < 0 : difference > 0)
                  ? value
                  : selected;
              }, values[0])
            : null;
        row[aggregation.alias] =
          aggregation.function === "count_rows"
            ? bucket.length
            : aggregation.function === "count"
              ? values.length
              : !values.length
                ? null
                : aggregation.function === "sum"
                  ? sum
                  : aggregation.function === "avg"
                    ? sum / values.length
                    : extreme;
      }
      return row;
    });
  }
  rows.sort((left, right) => {
    for (const order of orderBy) {
      const type = projectMetadata.get(order.field)?.value_type ?? "string";
      const comparison = compare(scalar(left[order.field], type), scalar(right[order.field], type));
      if (comparison) return order.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
  return {
    rows:
      groupBy.length || aggregations.length
        ? rows.slice(0, input.limit)
        : rows
            .slice(0, input.limit)
            .map((row) => Object.fromEntries(input.fields.map((field) => [field, row[field]]))),
    reachedLimit: rows.length > input.limit,
  };
}

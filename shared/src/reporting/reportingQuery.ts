import { z } from "zod";
import { ServiceError } from "../http/errors.js";
import { reportingAggregations } from "./reportingCapabilities.js";
import { reportingSources } from "./reportingSources.js";

const queryError = {
  errorMap: () => ({ message: "Critério inválido: confira o tipo e os valores informados." }),
};

const nameSchema = z
  .string(queryError)
  .regex(
    /^[a-z][a-z0-9_]*$/u,
    "Identificador inválido: use letras minúsculas, números e sublinhado.",
  )
  .max(64, "O identificador aceita até 64 caracteres.");
const valueSchema = z.union([
  z.string(queryError).max(2048, "O valor aceita até 2048 caracteres."),
  z.number(queryError).finite(),
  z.boolean(queryError),
  z.null(queryError),
]);
export const reportingQuerySchema = z
  .object({
    filters: z
      .array(
        z
          .object({
            field: nameSchema,
            operator: z.enum(
              ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "between"],
              queryError,
            ),
            parameter: nameSchema,
            value: z.union([
              valueSchema,
              z.array(valueSchema).max(100, "Informe no máximo 100 critérios ou valores."),
            ]),
          })
          .strict("O critério contém propriedades não permitidas."),
      )
      .max(100, "Informe no máximo 100 critérios ou valores.")
      .optional(),
    filter_groups: z
      .array(
        z
          .object({
            operator: z.enum(["and", "or"], queryError),
            filters: z
              .array(nameSchema)
              .min(1, "O grupo deve referenciar ao menos um critério.")
              .max(100, "Informe no máximo 100 critérios ou valores."),
          })
          .strict("O critério contém propriedades não permitidas."),
      )
      .max(100, "Informe no máximo 100 critérios ou valores.")
      .optional(),
    order_by: z
      .array(
        z
          .object({ field: nameSchema, direction: z.enum(["asc", "desc"], queryError) })
          .strict("O critério contém propriedades não permitidas."),
      )
      .max(25, "Informe no máximo 25 campos ou resumos.")
      .optional(),
    group_by: z.array(nameSchema).max(25, "Informe no máximo 25 campos ou resumos.").optional(),
    aggregations: z
      .array(
        z
          .object({
            field: nameSchema,
            function: z.enum(["count", "sum", "avg", "min", "max"], queryError),
            alias: nameSchema,
          })
          .strict("O critério contém propriedades não permitidas."),
      )
      .max(25, "Informe no máximo 25 campos ou resumos.")
      .optional(),
  })
  .strict("O critério contém propriedades não permitidas.");

export interface ReportingQuery {
  filters?: readonly {
    field: string;
    operator: string;
    parameter: string;
    value: unknown;
  }[];
  filter_groups?: readonly { operator: "and" | "or"; filters: readonly string[] }[];
  order_by?: readonly { field: string; direction: "asc" | "desc" }[];
  group_by?: readonly string[];
  aggregations?: readonly {
    field: string;
    function: "count" | "sum" | "avg" | "min" | "max";
    alias: string;
  }[];
}

type ReportingResult = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
};

type ReportingQueryCursorPage = ReportingResult & { nextCursor?: string };
type ReportingQueryCursorLoader = {
  loadPage: (
    fields: readonly string[],
    limit: number,
    cursor?: string,
  ) => Promise<ReportingQueryCursorPage>;
};

export const MAX_REPORTING_QUERY_ROWS = 50_000;
export const MAX_REPORTING_QUERY_LIMIT = MAX_REPORTING_QUERY_ROWS + 1;
export const MAX_REPORTING_QUERY_BYTES = 20 * 1024 * 1024;
export const REPORTING_QUERY_ROW_LIMIT_CODE = "REPORTING_QUERY_ROW_LIMIT_EXCEEDED";
export const REPORTING_QUERY_BYTE_LIMIT_CODE = "REPORTING_QUERY_BYTE_LIMIT_EXCEEDED";
export const REPORTING_QUERY_BYTE_LIMIT_MESSAGE =
  "O conjunto excede o limite global de bytes do relatório. Reduza os filtros ou as colunas e tente novamente.";

export function reportingQueryFields(fields: readonly string[], query?: ReportingQuery): string[] {
  return [
    ...new Set([
      ...fields,
      ...(query?.filters ?? []).map((filter) => filter.field),
      ...(query?.group_by ?? []),
      ...(query?.aggregations ?? []).map((aggregation) => aggregation.field),
      ...(query?.order_by ?? []).map((order) => order.field),
    ]),
  ];
}

type Scalar = string | number | boolean | null;

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

export async function executeReportingQuery(
  input: { source: string; fields: readonly string[]; limit: number; query: ReportingQuery },
  load:
    | ((fields: readonly string[], limit: number, offset: number) => Promise<ReportingResult>)
    | ReportingQueryCursorLoader,
): Promise<ReportingResult> {
  const parsed = reportingQuerySchema.safeParse(input.query);
  if (!parsed.success) throw new ServiceError(400, "Critérios de relatório inválidos.");
  const filters = input.query.filters ?? [];
  const orderBy = input.query.order_by ?? [];
  const groupBy = input.query.group_by ?? [];
  const aggregations = input.query.aggregations ?? [];
  const fields = reportingQueryFields(input.fields, input.query);
  const source = reportingSources.find((candidate) => candidate.key === input.source);
  const allowed = new Set<string>(source?.fields.map((field) => field.key));
  if (!source || fields.some((field) => !allowed.has(field))) {
    throw new ServiceError(403, "Campo ou área não publicado para relatórios.");
  }
  const metadata = new Map<string, { value_type: string; filter_operators: readonly string[] }>(
    source.fields.map((field) => [field.key, field]),
  );
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
    const field = metadata.get(filter.field);
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
      !reportingAggregations(metadata.get(aggregation.field)?.value_type ?? "").includes(
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
  let offset = 0;
  let cursor: string | undefined;
  for (;;) {
    const page: ReportingQueryCursorPage =
      typeof load === "function"
        ? await load(fields, 100, offset)
        : await load.loadPage(fields, 100, cursor);
    if (!page.rows.length && page.reachedLimit)
      throw new ServiceError(422, "A origem não conseguiu completar a consulta.");
    for (const row of page.rows) {
      bytes += Buffer.byteLength(JSON.stringify(row));
      if (bytes > MAX_REPORTING_QUERY_BYTES) {
        throw new ServiceError(
          422,
          REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
          undefined,
          REPORTING_QUERY_BYTE_LIMIT_CODE,
        );
      }
      if (completeRows.length >= MAX_REPORTING_QUERY_ROWS) {
        throw new ServiceError(
          422,
          "O conjunto excede a capacidade de consulta do relatório.",
          undefined,
          REPORTING_QUERY_ROW_LIMIT_CODE,
        );
      }
      completeRows.push(row);
    }
    if (!page.reachedLimit) break;
    if (typeof load === "function") {
      offset += 100;
      continue;
    }
    if (!page.nextCursor || page.nextCursor === cursor)
      throw new ServiceError(422, "A origem não conseguiu completar a consulta.");
    cursor = page.nextCursor;
  }
  const groups = input.query.filter_groups ?? [];
  const grouped = new Set(groups.flatMap((group) => group.filters));
  let rows = completeRows.filter((row) => {
    const matches = new Map(
      filters.map((filter) => {
        const type = metadata.get(filter.field)?.value_type ?? "string";
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
        const type = metadata.get(aggregation.field)?.value_type ?? "string";
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
          aggregation.function === "count"
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
      const type = metadata.get(order.field)?.value_type ?? "string";
      const a = scalar(left[order.field], type);
      const b = scalar(right[order.field], type);
      const comparison = compare(a, b);
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

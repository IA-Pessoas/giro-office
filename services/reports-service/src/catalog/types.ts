export type ReportSourceKey = string;

export const REPORT_VALUE_TYPES = ["string", "number", "boolean", "date"] as const;
export type ReportValueType = (typeof REPORT_VALUE_TYPES)[number];

export const REPORT_FILTER_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
] as const;
export type ReportFilterOperator = (typeof REPORT_FILTER_OPERATORS)[number];

export const REPORT_AGGREGATIONS = ["count", "sum", "avg", "min", "max"] as const;
export type ReportAggregation = (typeof REPORT_AGGREGATIONS)[number];

export interface ReportCatalogField {
  groupable?: boolean;
  sortable?: boolean;
  key: string;
  label: string;
  value_type: ReportValueType;
  filter_operators: readonly ReportFilterOperator[];
  aggregations: readonly ReportAggregation[];
}

export interface ReportCatalogSource {
  parameters?: readonly {
    key: string;
    label: string;
    type: "text" | "number" | "date" | "boolean" | "select";
    required?: boolean;
    options?: readonly { value: string; label: string }[];
  }[];
  key: ReportSourceKey;
  label: string;
  module: string;
  department_label?: string;
  description?: string;
  minimum_permission: number;
  fields: readonly ReportCatalogField[];
}

export interface ReportCatalogRelation {
  key: string;
  sources: readonly [ReportSourceKey, ReportSourceKey];
  cardinality: "one_to_one" | "one_to_many" | "many_to_one";
}

export interface ReportCatalogGrant {
  sources: Readonly<Record<ReportSourceKey, readonly string[]>>;
  relations: readonly string[];
}

export function deriveReportCatalogGrant(definition: {
  sources: readonly string[];
  columns: readonly { source: string; field: string }[];
  filters: readonly { source: string; field: string }[];
  aggregations: readonly { source: string; field: string }[];
  order_by: readonly { source: string; field: string }[];
  group_by?: readonly { source: string; field: string }[];
  joins: readonly { relation: string }[];
}): ReportCatalogGrant {
  const fieldsBySource = new Map<string, Set<string>>();
  const addField = (source: string, field: string) => {
    const fields = fieldsBySource.get(source) ?? new Set<string>();
    fields.add(field);
    fieldsBySource.set(source, fields);
  };

  for (const source of definition.sources) fieldsBySource.set(source, new Set());
  for (const column of definition.columns) addField(column.source, column.field);
  for (const filter of definition.filters) addField(filter.source, filter.field);
  for (const aggregation of definition.aggregations)
    addField(aggregation.source, aggregation.field);
  for (const orderBy of definition.order_by) addField(orderBy.source, orderBy.field);
  for (const groupBy of definition.group_by ?? []) addField(groupBy.source, groupBy.field);

  return {
    sources: Object.fromEntries(
      Array.from(fieldsBySource, ([source, fields]) => [source, Array.from(fields)]),
    ),
    relations: definition.joins.map((join) => join.relation),
  };
}

export interface ReportCatalogScope {
  organization_id: string;
  modules: Readonly<Record<string, number>>;
  grant?: ReportCatalogGrant;
}

export interface ReportPreviewAdapterInput {
  definition: unknown;
  parameter_values?: Readonly<Record<string, unknown>>;
  organization_id: string;
  limit: number;
  request_id: string;
}

export interface ReportPreviewAdapterResult {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
}

export type ReportPreviewAdapterOutput =
  | readonly Record<string, unknown>[]
  | ReportPreviewAdapterResult;

export function normalizeReportPreviewAdapterOutput(
  output: ReportPreviewAdapterOutput,
): ReportPreviewAdapterResult {
  return "rows" in output ? output : { rows: output, reachedLimit: false };
}

export interface ReportSourceAdapter {
  readonly sources: readonly ReportCatalogSource[];
  readonly relations: readonly ReportCatalogRelation[];
  isEnabled(scope: ReportCatalogScope): boolean;
  preview(input: ReportPreviewAdapterInput): Promise<ReportPreviewAdapterOutput>;
}

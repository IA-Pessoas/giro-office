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
  key: string;
  label: string;
  value_type: ReportValueType;
  filter_operators: readonly ReportFilterOperator[];
  aggregations: readonly ReportAggregation[];
}

export interface ReportCatalogSource {
  key: ReportSourceKey;
  label: string;
  module: string;
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

export interface ReportCatalogScope {
  organization_id: string;
  modules: Readonly<Record<string, number>>;
  grant?: ReportCatalogGrant;
}

export interface ReportPreviewAdapterInput {
  definition: unknown;
  organization_id: string;
  limit: number;
  request_id: string;
}

export interface ReportSourceAdapter {
  readonly sources: readonly ReportCatalogSource[];
  readonly relations: readonly ReportCatalogRelation[];
  isEnabled(scope: ReportCatalogScope): boolean;
  preview(input: ReportPreviewAdapterInput): Promise<readonly Record<string, unknown>[]>;
}

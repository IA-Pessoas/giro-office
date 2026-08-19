export const REPORT_SOURCE_KEYS = [
  "parcelamento.installments",
  "parcelamento.installment_competencies",
  "parcelamento.panoramas",
  "integracao.clients",
] as const;

export type ReportSourceKey = (typeof REPORT_SOURCE_KEYS)[number];

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
  module: "parcelamento" | "integracao";
  fields: readonly ReportCatalogField[];
  internal_keys: readonly string[];
}

export interface ReportCatalogRelation {
  key: string;
  sources: readonly [ReportSourceKey, ReportSourceKey];
}

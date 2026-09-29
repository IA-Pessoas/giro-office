import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const numberOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "date",
  filter_operators: readonly string[],
) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators,
    aggregations: reportingAggregations(value_type),
  };
}

export const MARKETING_BUDGET_REPORTING_SOURCES = ["marketing.budgets"] as const;
export type MarketingBudgetReportingSource = (typeof MARKETING_BUDGET_REPORTING_SOURCES)[number];

export const marketingBudgetReportingCatalog = {
  sources: [
    {
      key: "marketing.budgets",
      label: "Orçamentos",
      module: "marketing",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("title", "Título", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("department_id", "Departamento", "string", stringOperators),
        field("department_name", "Nome do departamento", "string", stringOperators),
        field("created_at", "Data de criação", "date", dateOperators),
        field("items_count", "Quantidade de itens", "number", numberOperators),
        field("total_amount", "Valor total dos itens", "number", numberOperators),
        field("items_summary", "Itens", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getMarketingBudgetReportingFields(
  source: MarketingBudgetReportingSource,
): readonly string[] {
  return (
    marketingBudgetReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

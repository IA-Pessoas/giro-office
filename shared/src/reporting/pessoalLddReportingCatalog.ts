import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "date",
  filter_operators: readonly string[],
  aggregations: readonly string[] = [],
) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators,
    aggregations: [...new Set([...aggregations, ...reportingAggregations(value_type)])],
  };
}

export const PESSOAL_LDD_REPORTING_SOURCES = ["pessoal.ldd"] as const;
export type PessoalLddReportingSource = (typeof PESSOAL_LDD_REPORTING_SOURCES)[number];

export const pessoalLddReportingCatalog = {
  sources: [
    {
      key: "pessoal.ldd",
      label: "LDD de Departamento Pessoal",
      module: "pessoal",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("type", "Tipo", "string", stringOperators),
        field("period", "Período", "string", stringOperators),
        field("due_date", "Vencimento", "date", dateOperators),
        field("balance_amount", "Saldo", "number", numberOperators, [
          "count",
          "sum",
          "avg",
          "min",
          "max",
        ]),
        field("registration_status", "Situação cadastral", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getPessoalLddReportingFields(source: PessoalLddReportingSource): readonly string[] {
  return (
    pessoalLddReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

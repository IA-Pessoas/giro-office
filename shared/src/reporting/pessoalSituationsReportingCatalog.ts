import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
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

export const PESSOAL_SITUATIONS_REPORTING_SOURCES = ["pessoal.situations"] as const;
export type PessoalSituationsReportingSource =
  (typeof PESSOAL_SITUATIONS_REPORTING_SOURCES)[number];

export const pessoalSituationsReportingCatalog = {
  sources: [
    {
      key: "pessoal.situations",
      label: "Situações de Departamento Pessoal",
      module: "pessoal",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string", ["eq", "in"]),
        field("registered_by_id", "Registrador", "string", ["eq", "in"]),
        field("completed_by_id", "Concluidor", "string", ["eq", "in"]),
      ],
      fields: [
        field("status", "Status", "string", stringOperators),
        field("title", "Título", "string", stringOperators),
        field("registration_date", "Data de registro", "date", dateOperators),
        field("completion_date", "Data de conclusão", "date", dateOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getPessoalSituationsReportingFields(
  source: PessoalSituationsReportingSource,
): readonly string[] {
  return (
    pessoalSituationsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

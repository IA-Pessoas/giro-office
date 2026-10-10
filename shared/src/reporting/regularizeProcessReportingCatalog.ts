import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "date",
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

export const REGULARIZE_PROCESS_REPORTING_SOURCES = ["regularize.processes"] as const;
export type RegularizeProcessReportingSource =
  (typeof REGULARIZE_PROCESS_REPORTING_SOURCES)[number];

export const regularizeProcessReportingCatalog = {
  sources: [
    {
      key: "regularize.processes",
      label: "Processos do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [
        field("client_pj_id", "Cliente PJ", "string", ["eq", "in"]),
        field("client_pf_id", "Cliente PF", "string", ["eq", "in"]),
        field("responsible1_id", "Responsável principal", "string", ["eq", "in"]),
        field("responsible2_id", "Responsável secundário", "string", ["eq", "in"]),
        field("responsible3_id", "Responsável terciário", "string", ["eq", "in"]),
        field("task_id", "Tarefa", "string", ["eq", "in"]),
      ],
      fields: [
        field("process_type", "Tipo", "string", stringOperators),
        field("entry_date", "Data de entrada", "date", dateOperators),
        field("completion_date", "Data de conclusão", "date", dateOperators),
        field("expected_date", "Data prevista", "date", dateOperators),
        field("status", "Status", "string", stringOperators),
        field("locking_type", "Travamento", "string", stringOperators),
        field("urgency", "Urgência", "string", stringOperators),
        field("locked", "Travado", "boolean", booleanOperators),
        field("client_name", "Cliente", "string", stringOperators),
        field("description", "Descrição", "string", stringOperators),
        field("observation", "Observação", "string", stringOperators),
        field("financial_status", "Situação financeira", "string", stringOperators),
        field("responsible1_name", "Responsável principal", "string", stringOperators),
        field("responsible2_name", "Responsável secundário", "string", stringOperators),
        field("responsible3_name", "Responsável terciário", "string", stringOperators),
        // Mês no formato AAAA-MM, para agrupar e filtrar por mês como no legado.
        field("entry_month", "Mês de entrada", "string", stringOperators),
        field("completion_month", "Mês de conclusão", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRegularizeProcessReportingFields(
  source: RegularizeProcessReportingSource,
): readonly string[] {
  return (
    regularizeProcessReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

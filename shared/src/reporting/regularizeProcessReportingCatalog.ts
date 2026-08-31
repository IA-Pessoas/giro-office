const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] as const };
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
        field("locking_type", "Bloqueio", "string", stringOperators),
        field("urgency", "Urgência", "string", stringOperators),
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

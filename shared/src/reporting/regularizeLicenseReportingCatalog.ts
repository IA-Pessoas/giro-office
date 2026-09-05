const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] as const };
}

export const REGULARIZE_LICENSE_REPORTING_SOURCES = ["regularize.licenses"] as const;
export type RegularizeLicenseReportingSource =
  (typeof REGULARIZE_LICENSE_REPORTING_SOURCES)[number];

export const regularizeLicenseReportingCatalog = {
  sources: [
    {
      key: "regularize.licenses",
      label: "Licenças do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string", ["eq", "in"]),
        field("responsible_id", "Responsável", "string", ["eq", "in"]),
        field("task_id", "Tarefa", "string", ["eq", "in"]),
      ],
      fields: [
        field("has", "Possui", "boolean", booleanOperators),
        field("type_license", "Tipo", "string", stringOperators),
        field("protocol", "Protocolo", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("current_situation", "Situação atual", "string", stringOperators),
        field("urgency", "Urgência", "string", stringOperators),
        field("entry_date", "Data de entrada", "date", dateOperators),
        field("date_last_consultation", "Data da última consulta", "date", dateOperators),
        field("due_date", "Data de vencimento", "date", dateOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRegularizeLicenseReportingFields(
  source: RegularizeLicenseReportingSource,
): readonly string[] {
  return (
    regularizeLicenseReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

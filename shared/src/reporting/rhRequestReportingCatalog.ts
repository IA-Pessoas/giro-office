const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] };
}

export const RH_REQUEST_REPORTING_SOURCES = ["rh.requests"] as const;
export type RhRequestReportingSource = (typeof RH_REQUEST_REPORTING_SOURCES)[number];

export const rhRequestReportingCatalog = {
  sources: [
    {
      key: "rh.requests",
      label: "Solicitações de RH",
      module: "rh",
      minimum_permission: 1,
      keys: [
        field("requester_user_id", "Solicitante", "string", ["eq", "in"]),
        field("assigned_to_user_id", "Responsável", "string", ["eq", "in"]),
      ],
      fields: [
        field("title", "Título", "string", stringOperators),
        field("category", "Categoria", "string", stringOperators),
        field("urgency", "Urgência", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("created_at", "Data de criação", "date", dateOperators),
        field("updated_at", "Data de atualização", "date", dateOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRhRequestReportingFields(source: RhRequestReportingSource): readonly string[] {
  return (
    rhRequestReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

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

export const TI_REQUESTS_REPORTING_SOURCES = ["ti.requests"] as const;
export type TiRequestsReportingSource = (typeof TI_REQUESTS_REPORTING_SOURCES)[number];

export const tiRequestsReportingCatalog = {
  sources: [
    {
      key: "ti.requests",
      label: "Chamados de Tecnologia",
      module: "ti",
      minimum_permission: 1,
      keys: [
        field("requester_id", "Solicitante", "string", ["eq", "in"]),
        field("assigned_to_id", "Responsável", "string", ["eq", "in"]),
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

export function getTiRequestsReportingFields(source: TiRequestsReportingSource): readonly string[] {
  return (
    tiRequestsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

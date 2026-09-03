const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const numberOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] };
}

export const PROJECT_REPORTING_SOURCES = ["integracao.projects"] as const;
export type ProjectReportingSource = (typeof PROJECT_REPORTING_SOURCES)[number];

export const projectReportingCatalog = {
  sources: [
    {
      key: "integracao.projects",
      label: "Projetos de Integração",
      module: "integracao",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string", ["eq", "in"]),
        field("sponsor_id", "Patrocinador", "string", ["eq", "in"]),
      ],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("start_date", "Data de início", "date", dateOperators),
        field("end_date", "Data de término", "date", dateOperators),
        field("objective", "Objetivo", "string", stringOperators),
        field("porcentage", "Percentual", "number", numberOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getProjectReportingFields(source: ProjectReportingSource): readonly string[] {
  return (
    projectReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

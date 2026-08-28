const booleanOperators = ["eq", "neq"] as const;
const keyOperators = ["eq", "in"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] };
}

export const CONTABIL_RESPONSIBLES_REPORTING_SOURCES = ["contabil.responsibles"] as const;
export type ContabilResponsiblesReportingSource =
  (typeof CONTABIL_RESPONSIBLES_REPORTING_SOURCES)[number];

export const contabilResponsiblesReportingCatalog = {
  sources: [
    {
      key: "contabil.responsibles",
      label: "Responsáveis Contábeis",
      module: "contabil",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string", keyOperators),
        field("person_responsible_id", "Responsável", "string", keyOperators),
        field("posted_by_id", "Publicador", "string", keyOperators),
      ],
      fields: [
        field("customer_with_movement", "Cliente com movimento", "boolean", booleanOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getContabilResponsiblesReportingFields(
  source: ContabilResponsiblesReportingSource,
): readonly string[] {
  return (
    contabilResponsiblesReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

import { reportingAggregations } from "./reportingCapabilities.js";

const booleanOperators = ["eq", "neq"] as const;
const textOperators = ["eq", "neq", "in"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean",
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

export const CONTABIL_RELATIONSHIP_REPORTING_SOURCES = ["contabil.relationship"] as const;
export type ContabilRelationshipReportingSource =
  (typeof CONTABIL_RELATIONSHIP_REPORTING_SOURCES)[number];

export const contabilRelationshipReportingCatalog = {
  sources: [
    {
      key: "contabil.relationship",
      label: "Relacionamento Contábil",
      module: "contabil",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", textOperators)],
      fields: [
        field("bidding", "Licitação", "boolean", booleanOperators),
        field("chart_accounts", "Plano de contas", "string", textOperators),
        field("tool", "Ferramenta", "string", textOperators),
        field("system", "Sistema", "string", textOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getContabilRelationshipReportingFields(
  source: ContabilRelationshipReportingSource,
): readonly string[] {
  return (
    contabilRelationshipReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

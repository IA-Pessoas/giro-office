import { contabilClientReportingFields } from "./contabilTriageReportingCatalog.js";
import { reportingAggregations } from "./reportingCapabilities.js";

const booleanOperators = ["eq", "neq"] as const;
const textOperators = ["eq", "neq", "in"] as const;
const stringOperators = ["eq", "neq", "contains", "in"] as const;

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
      // Uma linha por Relação Contábil, com os estados da ficha: sem resposta sai "Não
      // selecionado" na licitação (estado) e no plano de contas, cujo texto livre antigo é
      // preservado. O booleano de licitação continua vazio quando não há resposta.
      fields: [
        field("bidding", "Licitação", "boolean", booleanOperators),
        field("bidding_status", "Licitação (estado)", "string", textOperators),
        field("chart_accounts", "Plano de contas", "string", textOperators),
        field("tool", "Ferramenta", "string", textOperators),
        field("system", "Sistema", "string", textOperators),
        field("note", "Observação", "string", stringOperators),
        field("segment", "Segmento", "string", stringOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        field("posted_by_name", "Responsável pelo lançamento", "string", stringOperators),
        ...contabilClientReportingFields,
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

import { contabilClientReportingFields } from "./contabilTriageReportingCatalog.js";
import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const keyOperators = ["eq", "in"] as const;

function field(key: string, label: string, filter_operators: readonly string[]) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type: "string" as const,
    filter_operators,
    aggregations: reportingAggregations("string"),
  };
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
        field("client_id", "Cliente", keyOperators),
        field("person_responsible_id", "Responsável", keyOperators),
        field("posted_by_id", "Responsável pelo lançamento", keyOperators),
      ],
      // Uma linha por cliente do Contábil; sem responsável cadastrado, os nomes saem em
      // branco. "Cliente com movimento" vem do mesmo cadastro que as áreas da Triagem leem.
      fields: [
        field("responsible_name", "Responsável", stringOperators),
        field("posted_by_name", "Responsável pelo lançamento", stringOperators),
        ...contabilClientReportingFields,
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

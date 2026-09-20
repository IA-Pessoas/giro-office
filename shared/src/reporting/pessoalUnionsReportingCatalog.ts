import { reportingAggregations } from "./reportingCapabilities.js";

function field(key: string, label: string, value_type: "string" | "date") {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators: [],
    aggregations: reportingAggregations(value_type),
  } as const;
}

export const PESSOAL_UNIONS_REPORTING_SOURCES = ["pessoal.unions"] as const;
export type PessoalUnionsReportingSource = (typeof PESSOAL_UNIONS_REPORTING_SOURCES)[number];

export const pessoalUnionsReportingCatalog = {
  sources: [
    {
      key: "pessoal.unions",
      label: "Sindicatos de Departamento Pessoal",
      module: "pessoal",
      minimum_permission: 1,
      keys: [],
      fields: [field("name", "Nome", "string"), field("base_date", "Data-base", "date")],
    },
  ],
  relations: [],
} as const;

export function getPessoalUnionsReportingFields(
  source: PessoalUnionsReportingSource,
): readonly string[] {
  return (
    pessoalUnionsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

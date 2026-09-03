const stringOperators = ["eq", "neq", "contains", "in"] as const;

function field(key: string, label: string) {
  return {
    key,
    label,
    value_type: "string" as const,
    filter_operators: stringOperators,
    aggregations: [],
  };
}

export const FISCAL_ICMS_REPORTING_SOURCES = ["fiscal.icms"] as const;
export type FiscalIcmsReportingSource = (typeof FISCAL_ICMS_REPORTING_SOURCES)[number];

export const fiscalIcmsReportingCatalog = {
  sources: [
    {
      key: "fiscal.icms",
      label: "ICMS fiscal",
      module: "fiscal",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("state", "UF"),
        field("item_number", "NCM"),
        field("cest_code", "CEST"),
        field("description", "Descrição"),
        field("interstate_agreement", "Acordo interestadual"),
        field("applied_original_mva", "MVA aplicada"),
        field("adjusted_mva", "MVA ajustada"),
        field("original_mva", "MVA original"),
      ],
    },
  ],
  relations: [],
} as const;

export function getFiscalIcmsReportingFields(source: FiscalIcmsReportingSource): readonly string[] {
  return (
    fiscalIcmsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

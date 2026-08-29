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

export const FISCAL_IPI_REPORTING_SOURCES = ["fiscal.ipi"] as const;
export type FiscalIpiReportingSource = (typeof FISCAL_IPI_REPORTING_SOURCES)[number];

export const fiscalIpiReportingCatalog = {
  sources: [
    {
      key: "fiscal.ipi",
      label: "IPI fiscal",
      module: "fiscal",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("ncm", "NCM"),
        field("ex", "Exceção"),
        field("description", "Enquadramento legal"),
        field("aliquot", "Alíquota"),
      ],
    },
  ],
  relations: [],
} as const;

export function getFiscalIpiReportingFields(source: FiscalIpiReportingSource): readonly string[] {
  return (
    fiscalIpiReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

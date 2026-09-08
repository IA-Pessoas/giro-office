import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;

function stringField(key: string, label: string) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type: "string" as const,
    filter_operators: stringOperators,
    aggregations: reportingAggregations("string"),
  };
}

function dateField(key: string, label: string) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type: "date" as const,
    filter_operators: dateOperators,
    aggregations: reportingAggregations("date"),
  };
}

export const FISCAL_NCM_REPORTING_SOURCES = ["fiscal.ncm"] as const;
export type FiscalNcmReportingSource = (typeof FISCAL_NCM_REPORTING_SOURCES)[number];

export const fiscalNcmReportingCatalog = {
  sources: [
    {
      key: "fiscal.ncm",
      label: "NCM fiscal",
      module: "fiscal",
      minimum_permission: 1,
      keys: [],
      fields: [
        stringField("tax_regime", "Regime tributário"),
        stringField("ncm_code", "Código NCM"),
        stringField("federal_taxation_type", "Tributação federal"),
        stringField("cst_pis_outgoing", "Classificação PIS"),
        stringField("cst_cofins_outgoing", "Classificação COFINS"),
        stringField("product_group", "Grupo"),
        stringField("description", "Descrição"),
        dateField("validity_start_date", "Início da vigência"),
        dateField("validity_end_date", "Fim da vigência"),
      ],
    },
  ],
  relations: [],
} as const;

export function getFiscalNcmReportingFields(source: FiscalNcmReportingSource): readonly string[] {
  return (
    fiscalNcmReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

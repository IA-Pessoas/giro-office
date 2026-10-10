import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "boolean" | "date",
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

export const REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE = "regularize.municipal_taxes";
export const REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCES = [
  REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
] as const;
export type RegularizeMunicipalTaxesReportingSource =
  (typeof REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCES)[number];

export const regularizeMunicipalTaxesReportingCatalog = {
  sources: [
    {
      key: REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
      label: "Tributos Municipais do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("year", "Ano", "number", numberOperators),
        field("client_name", "Cliente", "string", stringOperators),
        field("client_city", "Município", "string", stringOperators),
        field("client_municipal_registration", "Inscrição municipal", "string", stringOperators),
        field("tff_is_applicable", "TFF aplicável", "boolean", booleanOperators),
        field("tff_amount", "Valor TFF", "number", numberOperators),
        field("tff_notes", "Observação TFF", "string", stringOperators),
        field("tff_analysis_is_done", "Análise TFF concluída", "boolean", booleanOperators),
        field("tff_sent_date", "Envio TFF", "date", dateOperators),
        field("tff_due_date", "Vencimento TFF", "date", dateOperators),
        field("tlp_is_applicable", "TLP aplicável", "boolean", booleanOperators),
        field("tlp_amount", "Valor TLP", "number", numberOperators),
        field("tlp_notes", "Observação TLP", "string", stringOperators),
        field("tlp_is_sent", "Envio TLP", "string", stringOperators),
        field("tlp_sent_date", "Data de envio TLP", "date", dateOperators),
        field("tlp_due_date", "Vencimento TLP", "date", dateOperators),
        field("tlp_not_email", "TLP: não enviar por e-mail", "boolean", booleanOperators),
        field("tll_is_applicable", "TLL aplicável", "boolean", booleanOperators),
        field("tll_amount", "Valor TLL", "number", numberOperators),
        field("tll_notes", "Observação TLL", "string", stringOperators),
        field("tll_is_sent", "Envio TLL", "string", stringOperators),
        field("tll_sent_date", "Data de envio TLL", "date", dateOperators),
        field("tll_due_date", "Vencimento TLL", "date", dateOperators),
        field("tll_analysis_is_done", "Análise TLL concluída", "boolean", booleanOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRegularizeMunicipalTaxesReportingFields(
  source: RegularizeMunicipalTaxesReportingSource,
): readonly string[] {
  return (
    regularizeMunicipalTaxesReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

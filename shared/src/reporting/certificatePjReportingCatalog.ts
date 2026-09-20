import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "date" | "number",
  filter_operators: readonly string[],
  aggregations: readonly string[] = [],
) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators,
    aggregations: [...new Set([...aggregations, ...reportingAggregations(value_type)])],
  };
}

export const CERTIFICATE_PJ_REPORTING_SOURCES = ["certificado.pj"] as const;
export type CertificatePjReportingSource = (typeof CERTIFICATE_PJ_REPORTING_SOURCES)[number];

export const certificatePjReportingCatalog = {
  sources: [
    {
      key: "certificado.pj",
      label: "Certificados PJ",
      module: "certificado",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("model", "Modelo", "string", stringOperators),
        field("legal_nature", "Natureza jurídica", "string", stringOperators),
        field("expiration_date", "Vencimento", "date", dateOperators),
        field("has_certificate", "Existência", "boolean", booleanOperators),
        field("was_paid", "Pagamento", "boolean", booleanOperators),
        field("payment_date", "Data paga", "date", dateOperators),
        field("payment_amount", "Valor pago", "number", numberOperators, [
          "count",
          "sum",
          "avg",
          "min",
          "max",
        ]),
      ],
    },
  ],
  relations: [],
} as const;

export function getCertificatePjReportingFields(
  source: CertificatePjReportingSource,
): readonly string[] {
  return (
    certificatePjReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

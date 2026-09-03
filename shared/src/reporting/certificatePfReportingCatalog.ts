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
  return { key, label, value_type, filter_operators, aggregations };
}

export const CERTIFICATE_PF_REPORTING_SOURCES = ["certificado.pf"] as const;
export type CertificatePfReportingSource = (typeof CERTIFICATE_PF_REPORTING_SOURCES)[number];

export const certificatePfReportingCatalog = {
  sources: [
    {
      key: "certificado.pf",
      label: "Certificados PF",
      module: "certificado",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("model", "Modelo", "string", stringOperators),
        field("enterprise", "Empresa", "string", stringOperators),
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

export function getCertificatePfReportingFields(
  source: CertificatePfReportingSource,
): readonly string[] {
  return (
    certificatePfReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

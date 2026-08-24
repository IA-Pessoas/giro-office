export const PARCELAMENTO_REPORTING_SOURCES = [
  "parcelamento.installments",
  "parcelamento.installment_competencies",
  "parcelamento.panoramas",
] as const;

export type ParcelamentoReportingSource = (typeof PARCELAMENTO_REPORTING_SOURCES)[number];

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const keyOperators = ["eq", "in"] as const;
const numberOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;
const numberAggregations = ["sum", "avg", "min", "max"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "boolean" | "date",
  filter_operators: readonly string[],
  aggregations: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations };
}

export const parcelamentoReportingCatalog = {
  sources: [
    {
      key: "parcelamento.installments",
      label: "Parcelamentos",
      module: "parcelamento",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", keyOperators, [])],
      fields: [
        field("type", "Tipo", "string", stringOperators, []),
        field("legal_nature", "Natureza jurídica", "string", stringOperators, []),
        field("jurisdiction", "Jurisdição", "string", stringOperators, []),
        field("status", "Status", "string", stringOperators, []),
        field("is_automatic_debit", "Débito automático", "boolean", booleanOperators, []),
        field(
          "consolidated_total_amount",
          "Total consolidado",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "first_installment_amount",
          "Primeira parcela",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "current_month_installment_amount",
          "Parcela do mês atual",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "outstanding_balance",
          "Saldo devedor",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "paid_installments_count",
          "Parcelas pagas",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "agreed_installments_count",
          "Parcelas acordadas",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "remaining_installments_count",
          "Parcelas restantes",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field(
          "overdue_installments_count",
          "Parcelas vencidas",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field("enrollment_date", "Data de adesão", "date", numberOperators, []),
        field("completion_date", "Data de conclusão", "date", numberOperators, []),
      ],
    },
    {
      key: "parcelamento.installment_competencies",
      label: "Competências de parcelamento",
      module: "parcelamento",
      minimum_permission: 1,
      keys: [field("installment_id", "Parcelamento", "string", keyOperators, [])],
      fields: [
        field("how_many_paid", "Quantidade paga", "number", numberOperators, numberAggregations),
        field(
          "how_many_overdue",
          "Quantidade vencida",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field("download", "Baixa realizada", "boolean", booleanOperators, []),
        field("upload_file", "Arquivo enviado", "boolean", booleanOperators, []),
        field("is_sent", "Enviado", "boolean", booleanOperators, []),
        field("submission_type", "Tipo de envio", "string", stringOperators, []),
        field(
          "installment_amount",
          "Valor da parcela",
          "number",
          numberOperators,
          numberAggregations,
        ),
        field("competence", "Competência", "string", stringOperators, []),
      ],
    },
    {
      key: "parcelamento.panoramas",
      label: "Panoramas de parcelamento",
      module: "parcelamento",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", keyOperators, [])],
      fields: [
        field("competence", "Competência", "string", stringOperators, []),
        field("cnd_municipal", "CND municipal", "boolean", booleanOperators, []),
        field("cnd_state", "CND estadual", "boolean", booleanOperators, []),
        field("cnd_federal", "CND federal", "boolean", booleanOperators, []),
        field("cnd_fgts", "CND FGTS", "boolean", booleanOperators, []),
        field("cnd_labor", "CND trabalhista", "boolean", booleanOperators, []),
        field("protests", "Protestos", "boolean", booleanOperators, []),
        field(
          "state_tax_situation",
          "Situação tributária estadual",
          "boolean",
          booleanOperators,
          [],
        ),
        field(
          "federal_tax_situation",
          "Situação tributária federal",
          "boolean",
          booleanOperators,
          [],
        ),
        field("responsavel_id", "Responsável", "string", keyOperators, []),
      ],
    },
  ],
  relations: [
    {
      key: "parcelamento.installments_competencies",
      sources: ["parcelamento.installments", "parcelamento.installment_competencies"],
      cardinality: "one_to_many",
    },
    {
      key: "parcelamento.installments_panoramas",
      sources: ["parcelamento.installments", "parcelamento.panoramas"],
      cardinality: "one_to_many",
    },
  ],
} as const;

export function getParcelamentoReportingFields(
  source: ParcelamentoReportingSource,
): readonly string[] {
  return (
    parcelamentoReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}

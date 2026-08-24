export const INTERNAL_REPORTING_SOURCES = [
  "parcelamento.installments",
  "parcelamento.installment_competencies",
  "parcelamento.panoramas",
] as const;

export type InternalReportingSource = (typeof INTERNAL_REPORTING_SOURCES)[number];

export const internalReportingCatalog = {
  sources: [
    {
      key: "parcelamento.installments",
      fields: [
        "client_id",
        "type",
        "legal_nature",
        "jurisdiction",
        "status",
        "is_automatic_debit",
        "consolidated_total_amount",
        "first_installment_amount",
        "current_month_installment_amount",
        "outstanding_balance",
        "paid_installments_count",
        "agreed_installments_count",
        "remaining_installments_count",
        "overdue_installments_count",
        "enrollment_date",
        "completion_date",
      ],
    },
    {
      key: "parcelamento.installment_competencies",
      fields: [
        "installment_id",
        "how_many_paid",
        "how_many_overdue",
        "download",
        "upload_file",
        "is_sent",
        "submission_type",
        "installment_amount",
        "competence",
      ],
    },
    {
      key: "parcelamento.panoramas",
      fields: [
        "client_id",
        "competence",
        "cnd_municipal",
        "cnd_state",
        "cnd_federal",
        "cnd_fgts",
        "cnd_labor",
        "protests",
        "state_tax_situation",
        "federal_tax_situation",
        "responsavel_id",
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

export function getInternalReportingFields(source: InternalReportingSource): readonly string[] {
  return (
    internalReportingCatalog.sources.find((candidate) => candidate.key === source)?.fields ?? []
  );
}

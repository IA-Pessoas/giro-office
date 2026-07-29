ALTER TABLE "parcelamento.installments"
ADD COLUMN "agreement_number" TEXT;

CREATE UNIQUE INDEX "parcelamento_installments_org_agreement_number_unique"
ON "parcelamento.installments"("organization_id", "agreement_number");

CREATE INDEX "parcelamento_installments_fallback_lookup_idx"
ON "parcelamento.installments"(
  "organization_id",
  "client_id",
  "type",
  "legal_nature",
  "jurisdiction",
  "enrollment_date"
);

CREATE INDEX "parcelamento_installments_org_status_idx"
ON "parcelamento.installments"("organization_id", "status");

CREATE UNIQUE INDEX "parcelamento_installment_competencies_unique"
ON "parcelamento.installmentsCompetencies"("organization_id", "installment_id", "competence");

CREATE INDEX "parcelamento_installment_competencies_parent_idx"
ON "parcelamento.installmentsCompetencies"("organization_id", "installment_id");

CREATE UNIQUE INDEX "parcelamento_panorama_client_competence_unique"
ON "parcelamento.panorama"("organization_id", "client_id", "competence");

CREATE INDEX "parcelamento_panorama_org_competence_idx"
ON "parcelamento.panorama"("organization_id", "competence");

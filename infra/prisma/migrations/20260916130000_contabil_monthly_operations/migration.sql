ALTER TABLE "contabil.control"
  ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "triagem.monthly"
  ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "triagem.bank_statements"
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "uq_contabil_control_org_client_competence"
  ON "contabil.control"("organization_id", "client_id", "competence");

CREATE INDEX "idx_contabil_control_client_competence_org_archived"
  ON "contabil.control"("client_id", "competence", "organization_id", "archived_at");

CREATE INDEX "idx_triagem_monthly_org_client_competence_archived"
  ON "triagem.monthly"("organization_id", "client_id", "competence", "archived_at");

CREATE INDEX "idx_triagem_bank_statements_org_client_competence_archived"
  ON "triagem.bank_statements"("organization_id", "client_id", "competence", "archived_at");

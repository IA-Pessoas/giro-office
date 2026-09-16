DROP INDEX "triagem.configs_client_id_type_key";
DROP INDEX "triagem.monthly_client_id_competence_type_key";
DROP INDEX "triagem.responsibles_client_id_type_key";

CREATE UNIQUE INDEX "uq_triagem_configs_org_client_type"
  ON "triagem.configs"("organization_id", "client_id", "type");
CREATE INDEX "idx_triagem_configs_org_client"
  ON "triagem.configs"("organization_id", "client_id");

CREATE UNIQUE INDEX "uq_triagem_monthly_org_client_competence_type"
  ON "triagem.monthly"("organization_id", "client_id", "competence", "type");
CREATE INDEX "idx_triagem_monthly_org_client_competence"
  ON "triagem.monthly"("organization_id", "client_id", "competence");

CREATE UNIQUE INDEX "uq_triagem_responsibles_org_client_type"
  ON "triagem.responsibles"("organization_id", "client_id", "type");
CREATE INDEX "idx_triagem_responsibles_org_client"
  ON "triagem.responsibles"("organization_id", "client_id");

CREATE TABLE "triagem.bank_statements" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "bank_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "organization_id" TEXT NOT NULL,
  CONSTRAINT "triagem.bank_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_triagem_bank_statements_status"
    CHECK ("status" IN ('PENDING', 'COMPLETED', 'ATTENTION', 'NOT_PRESENT', 'NOT_APPLICABLE'))
);

CREATE UNIQUE INDEX "uq_triagem_bank_statements_org_client_competence_bank"
  ON "triagem.bank_statements"("organization_id", "client_id", "competence", "bank_id");
CREATE INDEX "idx_triagem_bank_statements_org_client_competence"
  ON "triagem.bank_statements"("organization_id", "client_id", "competence");

ALTER TABLE "triagem.bank_statements"
  ADD CONSTRAINT "triagem.bank_statements_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "triagem.bank_statements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

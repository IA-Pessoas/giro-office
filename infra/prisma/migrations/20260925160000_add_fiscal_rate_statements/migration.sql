CREATE TABLE "fiscal.rate_statements" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_name" TEXT NOT NULL,
  "client_document" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "tax_type" VARCHAR(4) NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL,
  "issued_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.rate_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.rate_statements_tax_type_check" CHECK ("tax_type" IN ('ISS', 'ICMS')),
  CONSTRAINT "fiscal.rate_statements_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);

CREATE INDEX "fiscal.rate_statements_organization_id_client_id_competence_createdAt_idx"
  ON "fiscal.rate_statements" ("organization_id", "client_id", "competence", "createdAt");

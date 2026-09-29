CREATE TABLE "fiscal.monthly_revenues" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.monthly_revenues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.monthly_revenues_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "fiscal.monthly_revenues_competence_check" CHECK (EXTRACT(DAY FROM "competence") = 1)
);

CREATE UNIQUE INDEX "uq_fiscal_monthly_revenues_org_client_competence"
  ON "fiscal.monthly_revenues" ("organization_id", "client_id", "competence");

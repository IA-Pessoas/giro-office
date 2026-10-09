-- Responsável fiscal registrado quando o controle nasce; transferência só por ação explícita.
ALTER TABLE "fiscal.monthly_controls" ADD COLUMN "responsible_id" TEXT;

CREATE INDEX "idx_fiscal_monthly_controls_org_responsible"
  ON "fiscal.monthly_controls" ("organization_id", "responsible_id");

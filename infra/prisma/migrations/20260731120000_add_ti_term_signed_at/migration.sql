ALTER TABLE "tecnologia.terms"
  ADD COLUMN "signed_at" TIMESTAMP(3);

CREATE INDEX "idx_tecnologia_terms_org_signed_at"
  ON "tecnologia.terms" ("organization_id", "signed_at");

DROP INDEX IF EXISTS "idx_tecnologia_terms_org_reason";

ALTER TABLE "tecnologia.terms"
  ADD COLUMN "signed_at" TIMESTAMP(3);

UPDATE "tecnologia.terms"
SET "signed_at" = "date"
WHERE "signed_at" IS NULL
  AND "reason" IS NOT NULL
  AND btrim("reason") <> '';

CREATE INDEX "idx_tecnologia_terms_org_signed_at"
  ON "tecnologia.terms" ("organization_id", "signed_at");

DROP INDEX IF EXISTS "idx_tecnologia_terms_org_reason";

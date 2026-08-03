ALTER TABLE "tecnologia.passwords_users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "deactivated_by_user_id" TEXT,
  ADD COLUMN "deactivation_reason" TEXT;

ALTER TABLE "tecnologia.passwords_users"
  ADD CONSTRAINT "ck_tecnologia_passwords_deactivation"
  CHECK (
    (
      "active" = true
      AND "deactivated_at" IS NULL
      AND "deactivated_by_user_id" IS NULL
      AND "deactivation_reason" IS NULL
    )
    OR
    (
      "active" = false
      AND "deactivated_at" IS NOT NULL
      AND "deactivated_by_user_id" IS NOT NULL
      AND "deactivation_reason" IS NOT NULL
      AND "deactivation_reason" = btrim("deactivation_reason")
      AND length("deactivation_reason") BETWEEN 1 AND 500
    )
  );

CREATE INDEX "idx_tecnologia_passwords_org_active_local"
  ON "tecnologia.passwords_users"("organization_id", "active", "local");

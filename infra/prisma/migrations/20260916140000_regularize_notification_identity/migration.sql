ALTER TABLE "notification.regularize"
  ADD COLUMN IF NOT EXISTS "reference_date" TIMESTAMP(3);

UPDATE "notification.regularize"
SET "reference_date" = TIMESTAMP '1970-01-01 00:00:00'
WHERE "reference_date" IS NULL
  AND "regarding" = 'clientPF';

UPDATE "notification.regularize"
SET "reference_date" = date_trunc('day', "create_at")
WHERE "reference_date" IS NULL;

ALTER TABLE "notification.regularize"
  ALTER COLUMN "reference_date" SET NOT NULL,
  ALTER COLUMN "reference_date" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "notification.regularize"
    GROUP BY "organization_id", "user_id", "regarding", "regarding_id", "title", "reference_date"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_regularize_notification_identity: duplicate regularize notifications exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "uq_regularize_notification_identity";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_regularize_notification_identity"
  ON "notification.regularize" (
    "organization_id",
    "user_id",
    "regarding",
    "regarding_id",
    "title",
    "reference_date"
  );

CREATE INDEX IF NOT EXISTS "idx_regularize_license_org_due_date"
  ON "regularize.license" ("organization_id", "due_date");

CREATE INDEX IF NOT EXISTS "idx_regularize_license_org_status"
  ON "regularize.license" ("organization_id", "status");

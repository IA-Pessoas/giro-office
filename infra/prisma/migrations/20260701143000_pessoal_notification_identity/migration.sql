ALTER TABLE "notification.pessoal"
  ADD COLUMN IF NOT EXISTS "reference_date" TIMESTAMP(3);

UPDATE "notification.pessoal"
SET "reference_date" = date_trunc('day', "create_at")
WHERE "reference_date" IS NULL;

ALTER TABLE "notification.pessoal"
  ALTER COLUMN "reference_date" SET NOT NULL,
  ALTER COLUMN "reference_date" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "notification.pessoal"
    GROUP BY "organization_id", "user_id", "regarding", "regarding_id", "title", "reference_date"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_pessoal_notification_identity: duplicate pessoal notifications exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "uq_pessoal_notification_identity";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pessoal_notification_identity"
  ON "notification.pessoal" (
    "organization_id",
    "user_id",
    "regarding",
    "regarding_id",
    "title",
    "reference_date"
  );

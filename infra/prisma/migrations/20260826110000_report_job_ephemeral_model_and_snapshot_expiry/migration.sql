ALTER TABLE "reports.models"
  ADD COLUMN "is_ephemeral" BOOLEAN NOT NULL DEFAULT false;

UPDATE "reports.jobs"
SET lease_expires_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
    materialization_token = NULL,
    updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE status = 'processing';

CREATE INDEX "reports.snapshots_expires_at_idx"
  ON "reports.snapshots" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

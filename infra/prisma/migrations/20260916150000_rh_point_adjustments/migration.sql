ALTER TABLE "organizations"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE "rh.timeClockRequest"
  ALTER COLUMN "point_id" DROP NOT NULL;

ALTER TABLE "rh.timeSheets"
  ADD COLUMN "reopen_reason" TEXT,
  ADD COLUMN "reopened_at" TIMESTAMP(3),
  ADD COLUMN "reopened_by_user_id" TEXT;

CREATE UNIQUE INDEX "uq_rh_time_clock_request_pending_user_date"
  ON "rh.timeClockRequest" ("organization_id", "user_id", "date")
  WHERE "status" = 'Pendente';

CREATE INDEX "idx_rh_time_clock_request_org_date"
  ON "rh.timeClockRequest" ("organization_id", "date");

ALTER TABLE "commercial.prospecting"
  ADD COLUMN "reset_date" DATE,
  ADD COLUMN "reset_scheduled_by" TEXT,
  ADD COLUMN "reset_registered_at" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "reset_processed_at" TIMESTAMP(3) WITH TIME ZONE;

CREATE INDEX "idx_commercial_prospecting_reset_due"
  ON "commercial.prospecting" ("reset_date", "reset_processed_at");

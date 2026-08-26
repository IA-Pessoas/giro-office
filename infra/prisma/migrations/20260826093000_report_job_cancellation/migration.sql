ALTER TABLE "reports.jobs"
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3),
  ADD COLUMN "materialization_token" TEXT;

CREATE UNIQUE INDEX "reports.snapshots_report_job_id_key"
  ON "reports.snapshots"("report_job_id");

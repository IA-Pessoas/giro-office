ALTER TABLE "reports.jobs"
  ADD COLUMN "idempotency_key" VARCHAR(255),
  ADD COLUMN "idempotency_hash" CHAR(64);

CREATE UNIQUE INDEX "uq_reports_jobs_org_requester_idempotency_key"
  ON "reports.jobs" ("organization_id", "requester_id", "idempotency_key");

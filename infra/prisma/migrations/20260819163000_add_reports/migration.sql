CREATE TABLE "reports.models" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "department_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reports.models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.model_versions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_model_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports.model_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "requester_id" TEXT NOT NULL,
  "report_model_version_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payload_json" JSONB,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reports.jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_model_version_id" TEXT NOT NULL,
  "report_job_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),

  CONSTRAINT "reports.snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.snapshot_rows" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "row_number" INTEGER NOT NULL,
  "data_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports.snapshot_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.retention_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_model_id" TEXT,
  "retention_days" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reports.retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports.audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_job_id" TEXT,
  "actor_id" TEXT,
  "event_type" TEXT NOT NULL,
  "payload_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports.audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports.jobs_organization_id_requester_id_requested_at_idx"
  ON "reports.jobs" ("organization_id", "requester_id", "requested_at");

CREATE INDEX "reports.snapshot_rows_snapshot_id_row_number_idx"
  ON "reports.snapshot_rows" ("snapshot_id", "row_number");

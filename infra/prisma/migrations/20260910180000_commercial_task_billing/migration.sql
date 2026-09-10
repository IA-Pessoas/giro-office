CREATE TABLE IF NOT EXISTS "commercial.task_billing" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "hiring_status" TEXT NOT NULL,
  "payment" TEXT,
  "billing_description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial.task_billing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_commercial_task_billing_task"
  ON "commercial.task_billing" ("task_id");

CREATE INDEX IF NOT EXISTS "idx_commercial_task_billing_org_updated"
  ON "commercial.task_billing" ("organization_id", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial_task_billing_task_id_fkey'
  ) THEN
    ALTER TABLE "commercial.task_billing"
      ADD CONSTRAINT "commercial_task_billing_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial_task_billing_organization_id_fkey'
  ) THEN
    ALTER TABLE "commercial.task_billing"
      ADD CONSTRAINT "commercial_task_billing_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "integracao.commercial_task_billing_projection_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "audit_correlation_id" TEXT NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integracao.commercial_task_billing_projection_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_commercial_task_billing_projection_task"
  ON "integracao.commercial_task_billing_projection_events" ("organization_id", "task_id", "applied_at");

CREATE TABLE IF NOT EXISTS "commercial.outbox_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "audit_correlation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial.outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_commercial_outbox_dispatch"
  ON "commercial.outbox_events" ("status", "available_at", "created_at");

CREATE INDEX IF NOT EXISTS "idx_commercial_outbox_aggregate"
  ON "commercial.outbox_events" ("organization_id", "aggregate_id", "created_at");

CREATE TABLE IF NOT EXISTS "client.commercial_projection_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "audit_correlation_id" TEXT NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client.commercial_projection_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_client_commercial_projection_client"
  ON "client.commercial_projection_events" ("organization_id", "client_id", "applied_at");

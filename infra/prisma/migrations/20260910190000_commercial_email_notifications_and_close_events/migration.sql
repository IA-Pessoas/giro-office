CREATE TABLE IF NOT EXISTS "commercial.email_notifications" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "message" JSONB NOT NULL,
  "locked_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial.email_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commercial.email_notifications_event_id_key"
  ON "commercial.email_notifications" ("event_id");

CREATE INDEX IF NOT EXISTS "idx_commercial_email_notification_status"
  ON "commercial.email_notifications" ("organization_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "commercial.prospecting_close_events" (
  "event_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial.prospecting_close_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX IF NOT EXISTS "idx_commercial_prospecting_close_client"
  ON "commercial.prospecting_close_events" ("organization_id", "client_id", "applied_at");

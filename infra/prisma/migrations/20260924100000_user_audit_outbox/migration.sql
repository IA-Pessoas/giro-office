CREATE TYPE "UserAuditOutboxStatus" AS ENUM ('pending', 'processing', 'delivered', 'failed');

CREATE TABLE "user_audit_outbox_events" (
  "id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "UserAuditOutboxStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_audit_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_user_audit_outbox_dispatch"
ON "user_audit_outbox_events"("status", "available_at", "created_at");

REVOKE ALL ON TABLE "user_audit_outbox_events" FROM PUBLIC;
REVOKE ALL ON TYPE "UserAuditOutboxStatus" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "user_audit_outbox_events" FROM anon';
    EXECUTE 'REVOKE ALL ON TYPE "UserAuditOutboxStatus" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "user_audit_outbox_events" FROM authenticated';
    EXECUTE 'REVOKE ALL ON TYPE "UserAuditOutboxStatus" FROM authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giro_user_service_audit_runtime') THEN
    CREATE ROLE giro_user_service_audit_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE giro_user_service_audit_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF current_user <> 'giro_user_service_audit_runtime' THEN
    EXECUTE format('GRANT giro_user_service_audit_runtime TO %I', current_user);
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "user_audit_outbox_events" TO giro_user_service_audit_runtime;
GRANT USAGE ON TYPE "UserAuditOutboxStatus" TO giro_user_service_audit_runtime;

ALTER TABLE "user_audit_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_audit_outbox_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY giro_user_service_audit_runtime_outbox ON "user_audit_outbox_events"
  FOR ALL TO giro_user_service_audit_runtime
  USING (true)
  WITH CHECK (true);

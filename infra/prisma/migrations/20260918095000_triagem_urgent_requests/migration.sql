CREATE UNIQUE INDEX IF NOT EXISTS "uq_clients_id_organization_id"
  ON "clients"("id", "organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_id_organization_id"
  ON "users"("id", "organization_id");

CREATE TABLE "triagem.urgent_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "requester_id" TEXT NOT NULL,
  "responsible_id" TEXT NOT NULL,
  "urgency_code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution_note" TEXT,
  "resolved_at" TIMESTAMP(3),
  "dedupe_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.urgent_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.urgent_requests_competence_check"
    CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "triagem.urgent_requests_urgency_check"
    CHECK ("urgency_code" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT "triagem.urgent_requests_status_check"
    CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "triagem.urgent_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.urgent_requests_client_organization_fkey"
    FOREIGN KEY ("client_id", "organization_id")
    REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.urgent_requests_requester_organization_fkey"
    FOREIGN KEY ("requester_id", "organization_id")
    REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.urgent_requests_responsible_organization_fkey"
    FOREIGN KEY ("responsible_id", "organization_id")
    REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_triagem_urgent_requests_dedupe"
  ON "triagem.urgent_requests"("organization_id", "dedupe_key");
CREATE INDEX "idx_triagem_urgent_requests_scope"
  ON "triagem.urgent_requests"("organization_id", "client_id", "competence", "status", "created_at");
CREATE INDEX "idx_triagem_urgent_requests_responsible"
  ON "triagem.urgent_requests"("organization_id", "responsible_id", "status");

ALTER TABLE "triagem.urgent_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.urgent_requests" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "triagem.urgent_requests" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.urgent_requests" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.urgent_requests" FROM authenticated';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.urgent_requests" TO giro_user_runtime;
GRANT SELECT ON TABLE "clients", "users" TO giro_user_runtime;

DO $$
BEGIN
  IF current_user <> 'giro_user_runtime' THEN
    EXECUTE format('GRANT giro_user_runtime TO %I', current_user);
  END IF;
END;
$$;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.urgent_requests";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.urgent_requests"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

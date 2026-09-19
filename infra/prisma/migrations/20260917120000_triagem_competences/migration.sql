CREATE TABLE "triagem.competences" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "configuration_snapshot" JSONB NOT NULL,
  "responsible_snapshot" JSONB NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.competences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.competences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.competences_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "triagem.competences_organization_id_client_id_competence_key"
  ON "triagem.competences"("organization_id", "client_id", "competence");
CREATE INDEX "triagem.competences_organization_id_client_id_archived_at_idx"
  ON "triagem.competences"("organization_id", "client_id", "archived_at");
CREATE INDEX "triagem.competences_organization_id_competence_archived_at_idx"
  ON "triagem.competences"("organization_id", "competence", "archived_at");

CREATE TABLE "triagem.competence_history" (
  "id" TEXT NOT NULL,
  "competence_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "triagem.competence_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.competence_history_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "triagem.competence_history_competence_id_fkey"
    FOREIGN KEY ("competence_id") REFERENCES "triagem.competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.competence_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.competence_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "triagem.competence_history_organization_id_competence_id_created_at_idx"
  ON "triagem.competence_history"("organization_id", "competence_id", "created_at");

CREATE TABLE "triagem.outbox_events" (
  "id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "competence_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatched_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "triagem.outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.outbox_events_event_key_key" UNIQUE ("event_key"),
  CONSTRAINT "triagem.outbox_events_competence_id_fkey"
    FOREIGN KEY ("competence_id") REFERENCES "triagem.competences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.outbox_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "triagem.outbox_events_organization_id_dispatched_at_occurred_at_idx"
  ON "triagem.outbox_events"("organization_id", "dispatched_at", "occurred_at");
CREATE INDEX "triagem.outbox_events_aggregate_type_aggregate_id_occurred_at_idx"
  ON "triagem.outbox_events"("aggregate_type", "aggregate_id", "occurred_at");

ALTER TABLE "triagem.competences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competences" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triagem.outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.outbox_events" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "triagem.competences",
  "triagem.competence_history",
  "triagem.outbox_events"
FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.competences", "triagem.competence_history", "triagem.outbox_events" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.competences", "triagem.competence_history", "triagem.outbox_events" FROM authenticated';
  END IF;
END;
$$;
GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.competences" TO giro_user_runtime;
GRANT SELECT, INSERT ON TABLE "triagem.competence_history" TO giro_user_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.outbox_events" TO giro_user_runtime;
GRANT SELECT ON TABLE "clients", "triagem.configs", "triagem.responsibles" TO giro_user_runtime;

DO $$
BEGIN
  IF current_user <> 'giro_user_runtime' THEN
    EXECUTE format('GRANT giro_user_runtime TO %I', current_user);
  END IF;
END;
$$;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.competences";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.competences"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.competence_history";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.competence_history"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.outbox_events";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.outbox_events"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE OR REPLACE FUNCTION public.prevent_triagem_competence_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'triagem.competence_history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS triagem_competence_history_append_only
  ON "triagem.competence_history";
CREATE TRIGGER triagem_competence_history_append_only
  BEFORE UPDATE OR DELETE ON "triagem.competence_history"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_triagem_competence_history_mutation();

REVOKE UPDATE, DELETE ON TABLE "triagem.competence_history"
  FROM PUBLIC, giro_user_runtime;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE "triagem.competence_history" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE "triagem.competence_history" FROM authenticated';
  END IF;
END;
$$;

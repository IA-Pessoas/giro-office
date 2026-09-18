CREATE TABLE "triagem.external_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "responsible_id" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.external_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.external_links_type_check"
    CHECK ("type" IN ('CLOUD', 'DRIVE')),
  CONSTRAINT "triagem.external_links_url_check"
    CHECK ("url" ~ '^https://'),
  CONSTRAINT "triagem.external_links_competence_check"
    CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "triagem.external_links_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.external_links_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.external_links_responsible_id_fkey"
    FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_triagem_external_links_scope"
  ON "triagem.external_links"("organization_id", "client_id", "competence", "archived_at");
CREATE INDEX "idx_triagem_external_links_responsible"
  ON "triagem.external_links"("organization_id", "responsible_id");

ALTER TABLE "triagem.external_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.external_links" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "triagem.external_links" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.external_links" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.external_links" FROM authenticated';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.external_links" TO giro_user_runtime;
GRANT SELECT ON TABLE "clients", "users" TO giro_user_runtime;

DO $$
BEGIN
  IF current_user <> 'giro_user_runtime' THEN
    EXECUTE format('GRANT giro_user_runtime TO %I', current_user);
  END IF;
END;
$$;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.external_links";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.external_links"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

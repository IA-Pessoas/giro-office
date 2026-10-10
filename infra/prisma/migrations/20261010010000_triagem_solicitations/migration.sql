-- Solicitações legadas da Triagem (#1696): pedido próprio por cliente e competência,
-- distinto de triagem.urgent_requests. Categorias vêm do catálogo da organização, sem seed.
ALTER TABLE "triagem.catalog_items"
  DROP CONSTRAINT "triagem.catalog_items_kind_check";

ALTER TABLE "triagem.catalog_items"
  ADD CONSTRAINT "triagem.catalog_items_kind_check"
  CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'DELIVERY_METHOD', 'STATE_SITE', 'REQUEST_CATEGORY'));

ALTER TABLE "triagem.competence_catalog_snapshots"
  DROP CONSTRAINT "triagem.competence_catalog_snapshots_kind_check";

ALTER TABLE "triagem.competence_catalog_snapshots"
  ADD CONSTRAINT "triagem.competence_catalog_snapshots_kind_check"
  CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'DELIVERY_METHOD', 'STATE_SITE', 'REQUEST_CATEGORY'));

CREATE TABLE "triagem.solicitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requester_id" TEXT NOT NULL,
  "responsible_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.solicitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.solicitations_competence_check"
    CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "triagem.solicitations_status_check"
    CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "triagem.solicitations_closed_at_check"
    CHECK (("status" = 'CLOSED') = ("closed_at" IS NOT NULL)),
  CONSTRAINT "triagem.solicitations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.solicitations_client_organization_fkey"
    FOREIGN KEY ("client_id", "organization_id")
    REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.solicitations_category_organization_fkey"
    FOREIGN KEY ("category_id", "organization_id")
    REFERENCES "triagem.catalog_items"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.solicitations_requester_organization_fkey"
    FOREIGN KEY ("requester_id", "organization_id")
    REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.solicitations_responsible_organization_fkey"
    FOREIGN KEY ("responsible_id", "organization_id")
    REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_triagem_solicitations_scope"
  ON "triagem.solicitations"("organization_id", "client_id", "competence", "status");
CREATE INDEX "idx_triagem_solicitations_responsible"
  ON "triagem.solicitations"("organization_id", "responsible_id", "status", "created_at");

ALTER TABLE "triagem.solicitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.solicitations" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "triagem.solicitations" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.solicitations" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.solicitations" FROM authenticated';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.solicitations" TO giro_user_runtime;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.solicitations";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.solicitations"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

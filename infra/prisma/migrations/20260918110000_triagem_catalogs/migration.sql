CREATE UNIQUE INDEX "uq_triagem_competences_id_organization_id"
  ON "triagem.competences"("id", "organization_id");

CREATE TABLE "triagem.catalog_items" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.catalog_items_kind_check"
    CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'STATE_SITE')),
  CONSTRAINT "triagem.catalog_items_code_check"
    CHECK (length(btrim("code")) > 0),
  CONSTRAINT "triagem.catalog_items_label_check"
    CHECK (length(btrim("label")) > 0),
  CONSTRAINT "triagem.catalog_items_url_check"
    CHECK ("url" IS NULL OR "url" ~ '^https://'),
  CONSTRAINT "triagem.catalog_items_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_triagem_catalog_items_org_kind_code"
  ON "triagem.catalog_items"("organization_id", "kind", "code");
CREATE UNIQUE INDEX "uq_triagem_catalog_items_id_organization_id"
  ON "triagem.catalog_items"("id", "organization_id");
CREATE INDEX "idx_triagem_catalog_items_scope"
  ON "triagem.catalog_items"("organization_id", "kind", "archived_at", "label");

CREATE TABLE "triagem.competence_catalog_snapshots" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "competence_id" TEXT NOT NULL,
  "catalog_item_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "triagem.competence_catalog_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.competence_catalog_snapshots_kind_check"
    CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'STATE_SITE')),
  CONSTRAINT "triagem.competence_catalog_snapshots_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.competence_catalog_snapshots_competence_org_fkey"
    FOREIGN KEY ("competence_id", "organization_id")
    REFERENCES "triagem.competences"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.competence_catalog_snapshots_catalog_item_org_fkey"
    FOREIGN KEY ("catalog_item_id", "organization_id")
    REFERENCES "triagem.catalog_items"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_triagem_competence_catalog_snapshot_item"
  ON "triagem.competence_catalog_snapshots"("organization_id", "competence_id", "catalog_item_id");
CREATE INDEX "idx_triagem_competence_catalog_snapshots_scope"
  ON "triagem.competence_catalog_snapshots"("organization_id", "competence_id", "kind");

ALTER TABLE "triagem.catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.catalog_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_catalog_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.competence_catalog_snapshots" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "triagem.catalog_items",
  "triagem.competence_catalog_snapshots"
FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.catalog_items", "triagem.competence_catalog_snapshots" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.catalog_items", "triagem.competence_catalog_snapshots" FROM authenticated';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.catalog_items" TO giro_user_runtime;
GRANT SELECT, INSERT ON TABLE "triagem.competence_catalog_snapshots" TO giro_user_runtime;

DO $$
BEGIN
  IF current_user <> 'giro_user_runtime' THEN
    EXECUTE format('GRANT giro_user_runtime TO %I', current_user);
  END IF;
END;
$$;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.catalog_items";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.catalog_items"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.competence_catalog_snapshots";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.competence_catalog_snapshots"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

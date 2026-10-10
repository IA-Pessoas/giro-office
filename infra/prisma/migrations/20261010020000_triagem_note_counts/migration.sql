-- Contadores de notas da Triagem (#1697): XML entradas/saídas e NFSE prestadas/tomadas.
-- Pertencem a cliente e competência (uma linha), compartilhados por todas as solicitações.
CREATE TABLE "triagem.note_counts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "xml_inbound" INTEGER NOT NULL DEFAULT 0,
  "xml_outbound" INTEGER NOT NULL DEFAULT 0,
  "nfse_issued" INTEGER NOT NULL DEFAULT 0,
  "nfse_received" INTEGER NOT NULL DEFAULT 0,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "triagem.note_counts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "triagem.note_counts_competence_check"
    CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "triagem.note_counts_non_negative_check"
    CHECK ("xml_inbound" >= 0 AND "xml_outbound" >= 0 AND "nfse_issued" >= 0 AND "nfse_received" >= 0),
  CONSTRAINT "triagem.note_counts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.note_counts_client_organization_fkey"
    FOREIGN KEY ("client_id", "organization_id")
    REFERENCES "clients"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "triagem.note_counts_updated_by_organization_fkey"
    FOREIGN KEY ("updated_by_id", "organization_id")
    REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_triagem_note_counts_scope"
  ON "triagem.note_counts"("organization_id", "client_id", "competence");

ALTER TABLE "triagem.note_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "triagem.note_counts" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "triagem.note_counts" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.note_counts" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "triagem.note_counts" FROM authenticated';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.note_counts" TO giro_user_runtime;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON "triagem.note_counts";
CREATE POLICY giro_user_runtime_tenant_isolation ON "triagem.note_counts"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

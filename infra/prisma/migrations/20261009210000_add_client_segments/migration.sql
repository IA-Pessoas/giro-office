CREATE TABLE "clients.segments" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clients.segments_pkey" PRIMARY KEY ("id"),
  -- Tipos do legado (tb_integracao.segmentos): serviço, comércio e indústria.
  CONSTRAINT "clients.segments_type_check" CHECK ("type" IN ('servico', 'comercio', 'industria')),
  CONSTRAINT "clients.segments_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_client_segment_org_normalized_name"
  ON "clients.segments" ("organization_id", "normalized_name");

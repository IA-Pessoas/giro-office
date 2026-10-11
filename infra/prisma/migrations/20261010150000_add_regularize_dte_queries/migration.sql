-- Consulta diária ao DTE por cliente (#1746). Substitui as duas listas de CPF/CNPJ por dia
-- de tb_regularize.dte_status: uma linha por cliente e dia, done = consulta feita.
CREATE TABLE "regularize.dte_queries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "done" BOOLEAN NOT NULL,
  "updated_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "regularize.dte_queries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regularize.dte_queries_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "regularize.dte_queries_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_regularize_dte_query_client_date"
  ON "regularize.dte_queries" ("organization_id", "client_id", "date");

CREATE INDEX "idx_regularize_dte_query_org_date"
  ON "regularize.dte_queries" ("organization_id", "date");

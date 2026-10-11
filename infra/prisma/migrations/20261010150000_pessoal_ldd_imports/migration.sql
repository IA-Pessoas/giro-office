-- Arquivos LDD/INSS já importados por cliente (#1769). O hash do PDF é único por organização e
-- cliente: reenviar o mesmo arquivo não soma o débito de novo. Só metadados, sem conteúdo.
CREATE TABLE "pessoal.ldd_imports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "rows_count" INTEGER NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "imported_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pessoal.ldd_imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pessoal.ldd_imports_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pessoal.ldd_imports_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_pessoal_ldd_imports_file"
ON "pessoal.ldd_imports" ("organization_id", "client_id", "file_hash");

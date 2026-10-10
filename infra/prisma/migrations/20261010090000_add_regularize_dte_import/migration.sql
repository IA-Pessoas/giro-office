-- Importação manual de avisos DTE (#1744). O conteúdo colado não é armazenado: só o resumo,
-- as recusas e as duplicatas de cada importação, e os avisos extraídos.
CREATE TABLE "regularize.dte_imports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "total_rows" INTEGER NOT NULL,
  "created_count" INTEGER NOT NULL,
  "duplicate_count" INTEGER NOT NULL,
  "rejected_count" INTEGER NOT NULL,
  "duplicates" JSONB NOT NULL,
  "rejections" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "regularize.dte_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regularize.dte_imports_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_regularize_dte_import_org_created"
  ON "regularize.dte_imports" ("organization_id", "created_at");

-- dedupe_key = SHA-256 dos nove campos de Fiscal::cadastrarDTE do legado.
CREATE TABLE "regularize.dte_notices" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "import_id" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "aviso" TEXT NOT NULL,
  "cnpj_cpf" TEXT NOT NULL,
  "destinatario" TEXT NOT NULL,
  "remetente" TEXT NOT NULL,
  "data_emissao" TEXT,
  "assunto" TEXT NOT NULL,
  "data_leitura" TEXT,
  "data_ciencia" TEXT,
  "registro" TEXT,
  "pending_reading" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "regularize.dte_notices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regularize.dte_notices_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "regularize.dte_notices_import_id_fkey" FOREIGN KEY ("import_id")
    REFERENCES "regularize.dte_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_regularize_dte_notice_dedupe"
  ON "regularize.dte_notices" ("organization_id", "dedupe_key");

CREATE INDEX "idx_regularize_dte_notice_org_created"
  ON "regularize.dte_notices" ("organization_id", "created_at");

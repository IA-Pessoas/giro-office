CREATE TABLE "fiscal.anticipation_batches" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "file_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "responsible_id" TEXT NOT NULL,
  "reviewer_id" TEXT,
  "entry_count" INTEGER NOT NULL,
  "note_count" INTEGER NOT NULL,
  "item_count" INTEGER NOT NULL,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "created_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.anticipation_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.anticipation_batches_status_check" CHECK ("status" IN ('pending_review'))
);

CREATE INDEX "idx_fiscal_anticipation_batches_org_client_comp"
  ON "fiscal.anticipation_batches" ("organization_id", "client_id", "competence");

CREATE TABLE "fiscal.anticipation_items" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "entry" TEXT NOT NULL,
  "access_key" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "series" TEXT NOT NULL,
  "note_number" TEXT NOT NULL,
  "item_number" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "ncm" TEXT NOT NULL,
  "cfop" TEXT NOT NULL,
  "quantity" DECIMAL(15,4),
  "value" DECIMAL(15,2),
  "ipi" DECIMAL(15,2),
  "icms_st" DECIMAL(15,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.anticipation_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.anticipation_items_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
  CONSTRAINT "fiscal.anticipation_items_batch_id_fkey" FOREIGN KEY ("batch_id")
    REFERENCES "fiscal.anticipation_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Duplicata entre importações do mesmo cliente nunca entra em silêncio: a corrida vira 409.
CREATE UNIQUE INDEX "uq_fiscal_anticipation_items_org_client_key_item"
  ON "fiscal.anticipation_items" ("organization_id", "client_id", "access_key", "item_number");
CREATE INDEX "idx_fiscal_anticipation_items_org_batch"
  ON "fiscal.anticipation_items" ("organization_id", "batch_id", "access_key", "item_number");

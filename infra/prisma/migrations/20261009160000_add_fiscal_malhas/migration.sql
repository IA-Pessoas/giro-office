CREATE TABLE "fiscal.malhas" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "deadline" DATE,
  "status" TEXT NOT NULL,
  "responsible_id" TEXT,
  "task_id" TEXT,
  "attachment_path" TEXT,
  "attachment_original_name" TEXT,
  "attachment_mime_type" TEXT,
  "attachment_size_bytes" INTEGER,
  "attachment_uploaded_at" TIMESTAMP(3),
  "attachment_uploaded_by" TEXT,
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.malhas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.malhas_period_check" CHECK ("period_start" <= "period_end"),
  CONSTRAINT "fiscal.malhas_status_check" CHECK (
    "status" IN ('aberta', 'em_andamento', 'aguardando_cliente', 'respondida', 'encerrada')
  )
);

CREATE INDEX "idx_fiscal_malhas_org_client" ON "fiscal.malhas" ("organization_id", "client_id");
CREATE INDEX "idx_fiscal_malhas_org_status" ON "fiscal.malhas" ("organization_id", "status");

CREATE TABLE "fiscal.malha_history" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "malha_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "previous_value" TEXT,
  "new_value" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.malha_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.malha_history_field_check" CHECK ("field" IN ('deadline', 'status', 'responsible_id')),
  CONSTRAINT "fiscal.malha_history_malha_id_fkey" FOREIGN KEY ("malha_id")
    REFERENCES "fiscal.malhas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_fiscal_malha_history_org_malha_created"
  ON "fiscal.malha_history" ("organization_id", "malha_id", "created_at");

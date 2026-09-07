CREATE TABLE "integracao.project_wizard_confirmations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "command_hash" CHAR(64) NOT NULL,
  "response_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "integracao.project_wizard_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_project_wizard_confirmation_org_idempotency_key"
  ON "integracao.project_wizard_confirmations" ("organization_id", "idempotency_key");

CREATE INDEX "idx_project_wizard_confirmation_org"
  ON "integracao.project_wizard_confirmations" ("organization_id");

CREATE INDEX "idx_project_wizard_confirmation_project"
  ON "integracao.project_wizard_confirmations" ("project_id");

ALTER TABLE "integracao.project_wizard_confirmations"
  ADD CONSTRAINT "integracao.project_wizard_confirmations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracao.project_wizard_confirmations"
  ADD CONSTRAINT "integracao.project_wizard_confirmations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "integracao.projects"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

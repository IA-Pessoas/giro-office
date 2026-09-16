CREATE TABLE "pessoal.group_assignment_previews" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "target_group_id" TEXT NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "totals" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "applied_at" TIMESTAMP(3),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pessoal.group_assignment_previews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pessoal.group_assignment_preview_details" (
  "id" TEXT NOT NULL,
  "preview_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_name" TEXT,
  "payroll_id" TEXT,
  "previous_group_id" TEXT,
  "previous_group_name" TEXT,
  "outcome" TEXT NOT NULL,
  "skip_reason" TEXT,
  CONSTRAINT "pessoal.group_assignment_preview_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pessoal.group_assignment_confirmations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "preview_id" TEXT NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "command_hash" CHAR(64) NOT NULL,
  "response_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pessoal.group_assignment_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pessoal.audit_outbox_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "preview_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "pessoal.audit_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_pessoal_group_assignment_preview_client"
  ON "pessoal.group_assignment_preview_details"("preview_id", "client_id");
CREATE UNIQUE INDEX "uq_pessoal_group_assignment_confirmation_org_idempotency_key"
  ON "pessoal.group_assignment_confirmations"("organization_id", "idempotency_key");
CREATE INDEX "idx_pessoal_group_assignment_preview_org_expiry"
  ON "pessoal.group_assignment_previews"("organization_id", "expires_at");
CREATE INDEX "idx_pessoal_group_assignment_detail_preview_outcome"
  ON "pessoal.group_assignment_preview_details"("preview_id", "outcome", "id");
CREATE INDEX "idx_pessoal_group_assignment_confirmation_preview"
  ON "pessoal.group_assignment_confirmations"("preview_id");
CREATE INDEX "idx_pessoal_audit_outbox_dispatch"
  ON "pessoal.audit_outbox_events"("status", "created_at");
CREATE INDEX "idx_pessoal_audit_outbox_preview"
  ON "pessoal.audit_outbox_events"("organization_id", "preview_id");

ALTER TABLE "pessoal.group_assignment_previews"
  ADD CONSTRAINT "pessoal.group_assignment_previews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pessoal.group_assignment_previews_target_group_id_fkey"
  FOREIGN KEY ("target_group_id") REFERENCES "pessoal.group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pessoal.group_assignment_preview_details"
  ADD CONSTRAINT "pessoal.group_assignment_preview_details_preview_id_fkey"
  FOREIGN KEY ("preview_id") REFERENCES "pessoal.group_assignment_previews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "pessoal.group_assignment_preview_details_payroll_id_fkey"
  FOREIGN KEY ("payroll_id") REFERENCES "pessoal.payroll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pessoal.group_assignment_confirmations"
  ADD CONSTRAINT "pessoal.group_assignment_confirmations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pessoal.group_assignment_confirmations_preview_id_fkey"
  FOREIGN KEY ("preview_id") REFERENCES "pessoal.group_assignment_previews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pessoal.audit_outbox_events"
  ADD CONSTRAINT "pessoal.audit_outbox_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pessoal.audit_outbox_events_preview_id_fkey"
  FOREIGN KEY ("preview_id") REFERENCES "pessoal.group_assignment_previews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

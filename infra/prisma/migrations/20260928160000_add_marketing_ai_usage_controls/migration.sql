CREATE TABLE "marketing.ai_usage_controls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "competence" DATE NOT NULL,
    "knowledge" BOOLEAN,
    "integration" BOOLEAN,
    "frequency" INTEGER,
    "purpose" TEXT,
    "perceived_gain" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing.ai_usage_controls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketing.ai_usage_controls_frequency_check"
      CHECK ("frequency" IS NULL OR "frequency" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX "uq_marketing_ai_usage_controls_org_user_competence"
    ON "marketing.ai_usage_controls"("organization_id", "user_id", "competence");
CREATE INDEX "idx_marketing_ai_usage_controls_org_competence"
    ON "marketing.ai_usage_controls"("organization_id", "competence");
CREATE INDEX "idx_marketing_ai_usage_controls_user"
    ON "marketing.ai_usage_controls"("user_id");

ALTER TABLE "marketing.ai_usage_controls"
    ADD CONSTRAINT "marketing.ai_usage_controls_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing.ai_usage_import_reconciliation" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "legacy_user_id" TEXT NOT NULL,
    "legacy_competence" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing.ai_usage_import_reconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_marketing_ai_usage_reconciliation_org_status"
    ON "marketing.ai_usage_import_reconciliation"("organization_id", "status", "created_at");

ALTER TABLE "marketing.ai_usage_import_reconciliation"
    ADD CONSTRAINT "marketing.ai_usage_import_reconciliation_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing.ai_usage_controls"
    ADD CONSTRAINT "marketing.ai_usage_controls_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing.migration_reconciliation_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "migration_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "marketing.ai_usage_controls"
    ADD COLUMN "imported_from_legacy" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "marketing.migration_reconciliation_datasets" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "prepared_total" INTEGER,
    "imported_total" INTEGER,
    "quarantined_total" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "migration_reconciliation_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing.migration_reconciliation_items" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_identity_digest" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "field" TEXT,
    "reason_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "migration_reconciliation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing.migration_reconciliation_decisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_identity_digest" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "canonical_target_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "migration_reconciliation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_mkt_migration_runs_org_created"
    ON "marketing.migration_reconciliation_runs"("organization_id", "created_at" DESC);
CREATE UNIQUE INDEX "uq_mkt_migration_dataset_run_name"
    ON "marketing.migration_reconciliation_datasets"("run_id", "dataset");
CREATE UNIQUE INDEX "uq_mkt_migration_item_identity"
    ON "marketing.migration_reconciliation_items"("dataset_id", "source_table", "source_identity_digest", "step_id");
CREATE INDEX "idx_mkt_migration_items_reason"
    ON "marketing.migration_reconciliation_items"("dataset_id", "reason_code");
CREATE UNIQUE INDEX "uq_mkt_migration_decision_item"
    ON "marketing.migration_reconciliation_decisions"("organization_id", "dataset", "source_table", "source_identity_digest", "step_id");
CREATE UNIQUE INDEX "uq_mkt_migration_decision_request"
    ON "marketing.migration_reconciliation_decisions"("organization_id", "request_id");
CREATE INDEX "idx_mkt_migration_decisions_org_created"
    ON "marketing.migration_reconciliation_decisions"("organization_id", "created_at" DESC);

ALTER TABLE "marketing.migration_reconciliation_runs"
    ADD CONSTRAINT "migration_reconciliation_runs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing.migration_reconciliation_datasets"
    ADD CONSTRAINT "migration_reconciliation_datasets_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "marketing.migration_reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing.migration_reconciliation_items"
    ADD CONSTRAINT "migration_reconciliation_items_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "marketing.migration_reconciliation_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing.migration_reconciliation_decisions"
    ADD CONSTRAINT "marketing_migration_reconciliation_decisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

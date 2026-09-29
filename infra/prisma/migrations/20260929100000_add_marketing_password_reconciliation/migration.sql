CREATE TABLE "marketing.password_import_reconciliation" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing.password_import_reconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_marketing_password_import_reconciliation_org_status"
    ON "marketing.password_import_reconciliation"("organization_id", "status", "created_at");

ALTER TABLE "marketing.password_import_reconciliation"
    ADD CONSTRAINT "marketing.password_import_reconciliation_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_mtk_passwords_org_local_user"
    ON "mtk.passwords"("organization_id", "local", "user");

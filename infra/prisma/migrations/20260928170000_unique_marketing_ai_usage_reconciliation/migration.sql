CREATE UNIQUE INDEX "uq_marketing_ai_usage_reconciliation_org_user_competence"
    ON "marketing.ai_usage_import_reconciliation"("organization_id", "legacy_user_id", "legacy_competence");

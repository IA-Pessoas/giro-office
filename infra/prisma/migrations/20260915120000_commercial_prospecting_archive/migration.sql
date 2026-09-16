ALTER TABLE "commercial.prospecting"
ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "idx_commercial_prospecting_org_archived_updated"
ON "commercial.prospecting"("organization_id", "archived_at", "updated_at");

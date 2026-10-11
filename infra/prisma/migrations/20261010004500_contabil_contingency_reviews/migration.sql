CREATE TABLE "contabil.contingency_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_hash" TEXT,
    CONSTRAINT "contabil.contingency_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contabil.contingency_drafts_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contabil.contingency_drafts_review_check" CHECK (
        ("reviewed_by" IS NULL AND "reviewed_at" IS NULL AND "reviewed_hash" IS NULL) OR
        ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_hash" IS NOT NULL AND "reviewed_hash" = "content_hash")
    )
);
CREATE INDEX "contabil.contingency_drafts_organization_id_created_at_idx"
ON "contabil.contingency_drafts" ("organization_id", "created_at");

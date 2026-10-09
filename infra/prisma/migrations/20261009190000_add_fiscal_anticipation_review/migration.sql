ALTER TABLE "fiscal.anticipation_batches"
  DROP CONSTRAINT "fiscal.anticipation_batches_status_check",
  ADD CONSTRAINT "fiscal.anticipation_batches_status_check"
    CHECK ("status" IN ('pending_review', 'awaiting_check', 'checked')),
  -- Conferido ou aguardando conferência sempre tem conferente.
  ADD CONSTRAINT "fiscal.anticipation_batches_reviewer_check"
    CHECK ("status" = 'pending_review' OR "reviewer_id" IS NOT NULL);

ALTER TABLE "fiscal.anticipation_items"
  ADD COLUMN "classification" TEXT,
  ADD COLUMN "manual_value" DECIMAL(15,2),
  ADD COLUMN "corrections" JSONB NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "fiscal.anticipation_items_classification_check"
    CHECK ("classification" IS NULL OR "classification" IN ('partial', 'total', 'freight'));

CREATE TABLE "fiscal.anticipation_history" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "item_id" TEXT,
  "field" TEXT NOT NULL,
  "previous_value" TEXT,
  "new_value" TEXT,
  "reason" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.anticipation_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.anticipation_history_batch_id_fkey" FOREIGN KEY ("batch_id")
    REFERENCES "fiscal.anticipation_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal.anticipation_history_item_id_fkey" FOREIGN KEY ("item_id")
    REFERENCES "fiscal.anticipation_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_fiscal_anticipation_history_org_batch_created"
  ON "fiscal.anticipation_history" ("organization_id", "batch_id", "created_at");

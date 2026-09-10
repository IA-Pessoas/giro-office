CREATE TABLE "reports.snapshot_blocks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "snapshot_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "columns_json" JSONB NOT NULL,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports.snapshot_blocks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reports.snapshot_rows"
  ADD COLUMN "block_id" TEXT;

CREATE UNIQUE INDEX "reports.snapshot_blocks_snapshot_id_position_key"
  ON "reports.snapshot_blocks" ("snapshot_id", "position");

CREATE INDEX "reports.snapshot_blocks_snapshot_id_position_idx"
  ON "reports.snapshot_blocks" ("snapshot_id", "position");

CREATE INDEX "reports.snapshot_rows_snapshot_id_block_id_row_number_idx"
  ON "reports.snapshot_rows" ("snapshot_id", "block_id", "row_number");

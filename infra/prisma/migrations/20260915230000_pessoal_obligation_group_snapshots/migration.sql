UPDATE "pessoal.group"
SET "policy" = 'NORMAL'
WHERE "policy" IS NULL;

ALTER TABLE "pessoal.group"
  ALTER COLUMN "policy" SET DEFAULT 'NORMAL',
  ALTER COLUMN "policy" SET NOT NULL,
  ADD CONSTRAINT "chk_pessoal_group_policy"
    CHECK ("policy" IN ('NORMAL', 'NO_OBLIGATIONS'));

ALTER TABLE "pessoal.obrigations"
  ADD COLUMN "group_snapshot_id" TEXT,
  ADD COLUMN "group_snapshot_name" TEXT,
  ADD COLUMN "group_snapshot_policy" TEXT,
  ADD CONSTRAINT "chk_pessoal_obligations_group_snapshot_complete"
    CHECK (
      ("group_snapshot_id" IS NULL AND "group_snapshot_name" IS NULL AND "group_snapshot_policy" IS NULL)
      OR (
        "group_snapshot_id" IS NOT NULL
        AND "group_snapshot_name" IS NOT NULL
        AND "group_snapshot_policy" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "chk_pessoal_obligations_group_snapshot_policy"
    CHECK (
      "group_snapshot_policy" IS NULL
      OR "group_snapshot_policy" IN ('NORMAL', 'NO_OBLIGATIONS')
    );

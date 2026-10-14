ALTER TABLE "rh.score"
ADD COLUMN "formula_version" TEXT NOT NULL DEFAULT 'LegacyV1';

UPDATE "rh.score"
SET "formula_version" = 'OfficeV1';

ALTER TABLE "rh.score"
ALTER COLUMN "formula_version" SET DEFAULT 'LegacyV1';

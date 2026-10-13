ALTER TABLE "commercial.prospecting"
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ;

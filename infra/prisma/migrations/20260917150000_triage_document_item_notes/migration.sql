ALTER TABLE "triagem.monthly"
  ADD COLUMN "item_notes" JSONB NOT NULL DEFAULT '{}'::jsonb;

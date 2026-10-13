ALTER TABLE "commercial.prospecting"
  ADD COLUMN "solution" TEXT,
  ADD COLUMN "reference_month" TEXT,
  ADD COLUMN "service" TEXT,
  ADD COLUMN "participants" TEXT,
  ADD COLUMN "meeting_mode" TEXT,
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "pause_reason" TEXT,
  ADD COLUMN "attachment_path" TEXT,
  ADD COLUMN "attachment_name" TEXT,
  ADD COLUMN "attachment_mime_type" TEXT,
  ADD COLUMN "attachment_size_bytes" INTEGER;

CREATE TABLE "commercial.prospecting_history" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" TEXT NOT NULL,
  "prospecting_id" TEXT NOT NULL,
  "changed_by" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial.prospecting_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial.prospecting_history_prospecting_id_fkey"
    FOREIGN KEY ("prospecting_id") REFERENCES "commercial.prospecting"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commercial.prospecting_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_commercial_prospecting_history_scope"
  ON "commercial.prospecting_history"("organization_id", "prospecting_id", "created_at");
CREATE INDEX "idx_commercial_prospecting_history_prospecting"
  ON "commercial.prospecting_history"("prospecting_id");

ALTER TABLE "commercial.prospecting_history" ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'CommercialProspectingPrivate',
  'CommercialProspectingPrivate',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

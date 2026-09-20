CREATE TABLE IF NOT EXISTS "commercial.prospecting" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "status_date" TIMESTAMP(3),
  "description" TEXT,
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial.prospecting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_commercial_prospecting_org_client"
  ON "commercial.prospecting" ("organization_id", "client_id");

CREATE INDEX IF NOT EXISTS "idx_commercial_prospecting_org_status"
  ON "commercial.prospecting" ("organization_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial.prospecting_client_id_fkey'
  ) THEN
    ALTER TABLE "commercial.prospecting"
      ADD CONSTRAINT "commercial.prospecting_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commercial.prospecting_organization_id_fkey'
  ) THEN
    ALTER TABLE "commercial.prospecting"
      ADD CONSTRAINT "commercial.prospecting_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

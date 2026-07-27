ALTER TABLE "tecnologia.requests"
  ADD COLUMN IF NOT EXISTS "attachment" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tecnologia_extensions_org_number"
  ON "tecnologia.extensions" ("organization_id", "number");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tecnologia_inventory_org_asset_code"
  ON "tecnologia.inventory" ("organization_id", "asset_code");

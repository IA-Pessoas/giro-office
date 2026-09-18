CREATE TABLE "pessoal.group_migration_mapping" (
    "id" TEXT NOT NULL,
    "legacy_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "mapped_by_id" TEXT NOT NULL,
    "mapped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution_kind" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "pessoal.group_migration_mapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_pessoal_group_migration_mapping_org_normalized"
  ON "pessoal.group_migration_mapping"("organization_id", "normalized_value");
CREATE INDEX "idx_pessoal_group_migration_mapping_org_group"
  ON "pessoal.group_migration_mapping"("organization_id", "group_id");

ALTER TABLE "pessoal.group_migration_mapping"
  ADD CONSTRAINT "pessoal.group_migration_mapping_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "pessoal.group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pessoal.group_migration_mapping"
  ADD CONSTRAINT "pessoal.group_migration_mapping_mapped_by_id_fkey"
  FOREIGN KEY ("mapped_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pessoal.group_migration_mapping"
  ADD CONSTRAINT "pessoal.group_migration_mapping_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

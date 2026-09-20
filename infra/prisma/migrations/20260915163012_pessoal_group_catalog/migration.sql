CREATE TABLE "pessoal.group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "policy" TEXT,
    "system_key" TEXT,
    "archived_at" TIMESTAMP(3),
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "pessoal.group_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pessoal.payroll" ALTER COLUMN "group" DROP NOT NULL;
ALTER TABLE "pessoal.payroll" ADD COLUMN "group_id" TEXT;

CREATE UNIQUE INDEX "uq_pessoal_group_org_normalized_name"
  ON "pessoal.group"("organization_id", "normalized_name");
CREATE UNIQUE INDEX "uq_pessoal_group_org_system_key"
  ON "pessoal.group"("organization_id", "system_key");
CREATE INDEX "idx_pessoal_group_org_archived_name"
  ON "pessoal.group"("organization_id", "archived_at", "name");

ALTER TABLE "pessoal.group"
  ADD CONSTRAINT "pessoal.group_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pessoal.payroll"
  ADD CONSTRAINT "pessoal.payroll_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "pessoal.group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

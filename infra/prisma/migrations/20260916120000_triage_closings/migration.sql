CREATE TABLE "triagem"."closings" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "closings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "closings_organization_id_client_id_competence_key"
ON "triagem"."closings"("organization_id", "client_id", "competence");

CREATE INDEX "idx_triage_closings_org_client_competence_active"
ON "triagem"."closings"("organization_id", "client_id", "competence", "archived_at");

ALTER TABLE "triagem"."closings"
ADD CONSTRAINT "closings_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "triagem"."closings"
ADD CONSTRAINT "closings_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

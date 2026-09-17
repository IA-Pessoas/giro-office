CREATE TABLE "integracao.project_plan_hirings" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "response_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integracao.project_plan_hirings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_project_plan_hiring_org_plan_project"
  ON "integracao.project_plan_hirings" ("organization_id", "plan_id", "project_id");

CREATE INDEX "idx_project_plan_hiring_plan"
  ON "integracao.project_plan_hirings" ("plan_id");

CREATE INDEX "idx_project_plan_hiring_project"
  ON "integracao.project_plan_hirings" ("project_id");

ALTER TABLE "integracao.project_plan_hirings"
  ADD CONSTRAINT "integracao.project_plan_hirings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracao.project_plan_hirings"
  ADD CONSTRAINT "integracao.project_plan_hirings_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "integracao.projectPlan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integracao.project_plan_hirings"
  ADD CONSTRAINT "integracao.project_plan_hirings_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "integracao.projects"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

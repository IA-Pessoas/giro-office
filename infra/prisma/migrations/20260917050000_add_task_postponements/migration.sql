CREATE TABLE "integracao.task_postponements" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "previous_prevision_date" TIMESTAMP(3) NOT NULL,
    "new_prevision_date" TIMESTAMP(3) NOT NULL,
    "justification" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_postponements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_task_postponements_org_task_created"
  ON "integracao.task_postponements"("organization_id", "task_id", "created_at");
CREATE INDEX "idx_task_postponements_org_author_created"
  ON "integracao.task_postponements"("organization_id", "author_id", "created_at");

ALTER TABLE "integracao.task_postponements"
  ADD CONSTRAINT "task_postponements_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integracao.task_postponements"
  ADD CONSTRAINT "task_postponements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

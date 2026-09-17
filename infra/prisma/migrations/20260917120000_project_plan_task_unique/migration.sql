DELETE FROM "integracao.projectPlanTasks" AS duplicate
USING "integracao.projectPlanTasks" AS canonical
WHERE duplicate."organization_id" = canonical."organization_id"
  AND duplicate."plan_id" = canonical."plan_id"
  AND duplicate."task_id" = canonical."task_id"
  AND duplicate."id" > canonical."id";

CREATE UNIQUE INDEX "uq_project_plan_task_model"
ON "integracao.projectPlanTasks"("organization_id", "plan_id", "task_id");

DELETE FROM "integracao.tasksIntegrationRegularize" AS duplicate
USING "integracao.tasksIntegrationRegularize" AS canonical
WHERE duplicate."organization_id" = canonical."organization_id"
  AND duplicate."task_model_id" = canonical."task_model_id"
  AND duplicate."referring_type" = canonical."referring_type"
  AND duplicate."referring" = canonical."referring"
  AND duplicate."id" > canonical."id";

CREATE UNIQUE INDEX "uq_task_regularize_link"
ON "integracao.tasksIntegrationRegularize"("organization_id", "task_model_id", "referring_type", "referring");

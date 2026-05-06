-- CreateTable
CREATE TABLE "integracao.tasksIntegrationRegularize" (
    "id" TEXT NOT NULL,
    "task_model_id" TEXT NOT NULL,
    "referring" TEXT NOT NULL,
    "referring_type" TEXT NOT NULL,

    CONSTRAINT "integracao.tasksIntegrationRegularize_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integracao.tasksIntegrationRegularize" ADD CONSTRAINT "integracao.tasksIntegrationRegularize_task_model_id_fkey" FOREIGN KEY ("task_model_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

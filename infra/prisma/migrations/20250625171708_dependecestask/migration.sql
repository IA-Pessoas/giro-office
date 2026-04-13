-- CreateTable
CREATE TABLE "integracao.tasksDependent" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "dependent_id" TEXT NOT NULL,
    "wait" BOOLEAN NOT NULL,
    "observation" TEXT NOT NULL,

    CONSTRAINT "integracao.tasksDependent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integracao.tasksDependent" ADD CONSTRAINT "integracao.tasksDependent_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksDependent" ADD CONSTRAINT "integracao.tasksDependent_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

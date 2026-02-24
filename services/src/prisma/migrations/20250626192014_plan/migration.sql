-- CreateTable
CREATE TABLE "integracao.ProjectPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "integracao.ProjectPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao.ProjectPlanTasks" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "integracao.ProjectPlanTasks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integracao.ProjectPlanTasks" ADD CONSTRAINT "integracao.ProjectPlanTasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.ProjectPlanTasks" ADD CONSTRAINT "integracao.ProjectPlanTasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "integracao.ProjectPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

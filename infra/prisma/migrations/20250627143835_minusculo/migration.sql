/*
  Warnings:

  - You are about to drop the `integracao.ProjectPlan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `integracao.ProjectPlanTasks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "integracao.ProjectPlanTasks" DROP CONSTRAINT "integracao.ProjectPlanTasks_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "integracao.ProjectPlanTasks" DROP CONSTRAINT "integracao.ProjectPlanTasks_task_id_fkey";

-- DropTable
DROP TABLE "integracao.ProjectPlan";

-- DropTable
DROP TABLE "integracao.ProjectPlanTasks";

-- CreateTable
CREATE TABLE "integracao.projectPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "integracao.projectPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao.projectPlanTasks" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "integracao.projectPlanTasks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integracao.projectPlanTasks" ADD CONSTRAINT "integracao.projectPlanTasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projectPlanTasks" ADD CONSTRAINT "integracao.projectPlanTasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "integracao.projectPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

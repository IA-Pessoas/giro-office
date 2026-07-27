-- CreateTable
CREATE TABLE "integracao.tasksModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "responsible_id" TEXT NOT NULL,
    "responsible2_id" TEXT,
    "responsible3_id" TEXT,
    "observations" TEXT,
    "billing" TEXT NOT NULL,
    "prevision" INTEGER NOT NULL,
    "type" TEXT,

    CONSTRAINT "integracao.tasksModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao.projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "objective" TEXT,
    "sponsor_id" TEXT,

    CONSTRAINT "integracao.projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao.tasks" (
    "id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "observations" TEXT,
    "billing" TEXT NOT NULL,
    "urgency" INTEGER NOT NULL,
    "responsible_id" TEXT NOT NULL,
    "responsible2_id" TEXT,
    "responsible3_id" TEXT,
    "start_date" TIMESTAMP(3),
    "prevision_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "date_created" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3),
    "pending_approval" BOOLEAN,
    "charge_comercial" BOOLEAN,
    "charge_financeiro" BOOLEAN,

    CONSTRAINT "integracao.tasks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integracao.tasksModel" ADD CONSTRAINT "integracao.tasksModel_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksModel" ADD CONSTRAINT "integracao.tasksModel_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksModel" ADD CONSTRAINT "integracao.tasksModel_responsible2_id_fkey" FOREIGN KEY ("responsible2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksModel" ADD CONSTRAINT "integracao.tasksModel_responsible3_id_fkey" FOREIGN KEY ("responsible3_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projects" ADD CONSTRAINT "integracao.projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projects" ADD CONSTRAINT "integracao.projects_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "integracao.projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_responsible2_id_fkey" FOREIGN KEY ("responsible2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_responsible3_id_fkey" FOREIGN KEY ("responsible3_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "integracao.tasksModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

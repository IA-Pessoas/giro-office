-- CreateTable
CREATE TABLE "proposal.config" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minimum_wage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "proposal.config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda" (
    "id" TEXT NOT NULL,
    "agenda" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "client_id" TEXT,
    "location" TEXT,
    "participant_id" TEXT,
    "participant_id_2" TEXT,
    "participant_id_3" TEXT,
    "task_id" TEXT,
    "status" TEXT,
    "obs" TEXT,

    CONSTRAINT "agenda_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_participant_id_2_fkey" FOREIGN KEY ("participant_id_2") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_participant_id_3_fkey" FOREIGN KEY ("participant_id_3") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

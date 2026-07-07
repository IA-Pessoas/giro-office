-- CreateTable
CREATE TABLE "agenda.recurring" (
    "id" TEXT NOT NULL,
    "agenda" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "recurrence" TEXT NOT NULL,
    "client_id" TEXT,
    "location" TEXT,
    "participant_id" TEXT,
    "participant_id_2" TEXT,
    "participant_id_3" TEXT,
    "obs" TEXT,
    "department_control_id" TEXT NOT NULL,

    CONSTRAINT "agenda.recurring_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_participant_id_2_fkey" FOREIGN KEY ("participant_id_2") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_participant_id_3_fkey" FOREIGN KEY ("participant_id_3") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_department_control_id_fkey" FOREIGN KEY ("department_control_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

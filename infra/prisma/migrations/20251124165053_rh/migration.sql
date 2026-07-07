-- CreateTable
CREATE TABLE "rh.colaborators" (
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" TEXT,
    "birth_date" TIMESTAMP(3),
    "cpf" TEXT,
    "rg" TEXT,
    "address" TEXT,
    "job_title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hire_date" TEXT,
    "termination_date" TEXT,

    CONSTRAINT "rh.colaborators_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "rh.emergencyContacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "rh.emergencyContacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.allergies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fonts" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "rh.allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.pointConfig" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "lunch_break" TEXT NOT NULL,
    "lunch_return" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "signature" TEXT,
    "bank_balance" INTEGER NOT NULL DEFAULT 0,
    "work_days" TEXT NOT NULL DEFAULT '1,2,3,4,5',

    CONSTRAINT "rh.pointConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.timeSheets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "signature" TEXT,

    CONSTRAINT "rh.timeSheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.timeBankReleases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "is_approved" BOOLEAN NOT NULL,
    "added_by_user_id" TEXT NOT NULL,

    CONSTRAINT "rh.timeBankReleases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.points" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "lunch_out" TIMESTAMP(3),
    "launch_in" TIMESTAMP(3),
    "clock_out" TIMESTAMP(3),
    "workload_hours" INTEGER,
    "signature" TEXT,
    "time_bank_balance" INTEGER,

    CONSTRAINT "rh.points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.timeClockRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "point_id" TEXT NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "lunch_out" TIMESTAMP(3),
    "launch_in" TIMESTAMP(3),
    "clock_out" TIMESTAMP(3),
    "justification" TEXT NOT NULL,
    "attachment" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "approver_id" TEXT,
    "obs_approver" TEXT,

    CONSTRAINT "rh.timeClockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh.holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rh.colaborators_user_id_key" ON "rh.colaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rh.pointConfig_user_id_key" ON "rh.pointConfig"("user_id");

-- AddForeignKey
ALTER TABLE "rh.colaborators" ADD CONSTRAINT "rh.colaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.emergencyContacts" ADD CONSTRAINT "rh.emergencyContacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.allergies" ADD CONSTRAINT "rh.allergies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.pointConfig" ADD CONSTRAINT "rh.pointConfig_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeSheets" ADD CONSTRAINT "rh.timeSheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeBankReleases" ADD CONSTRAINT "rh.timeBankReleases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeBankReleases" ADD CONSTRAINT "rh.timeBankReleases_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.points" ADD CONSTRAINT "rh.points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeClockRequest" ADD CONSTRAINT "rh.timeClockRequest_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "rh.points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeClockRequest" ADD CONSTRAINT "rh.timeClockRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeClockRequest" ADD CONSTRAINT "rh.timeClockRequest_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

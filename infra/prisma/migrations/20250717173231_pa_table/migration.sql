/*
  Warnings:

  - You are about to drop the `PA` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "PA";

-- CreateTable
CREATE TABLE "clients.pa" (
    "client_id" TEXT NOT NULL,
    "activities" TEXT,
    "tax_billing" TEXT,
    "management_billing" TEXT,
    "works_bidding" BOOLEAN,
    "dissatisfaction" TEXT,
    "registered_collabortors" INTEGER,
    "unregistered_collabortors" INTEGER,
    "esocial" BOOLEAN,
    "how_many_banks" BOOLEAN,
    "whitch_banks" TEXT,
    "responsible_departments" TEXT,
    "works_system" BOOLEAN,
    "system_name" TEXT,
    "system_usage_time" TEXT,
    "system_value" TEXT,
    "system_contact" TEXT,
    "system_operations" TEXT,
    "cloud_storage" BOOLEAN,
    "which_cloud_storage" TEXT,
    "rental_agreement" BOOLEAN,
    "assessment_regime" TEXT,
    "permit" TEXT,
    "services" TEXT,

    CONSTRAINT "clients.pa_pkey" PRIMARY KEY ("client_id")
);

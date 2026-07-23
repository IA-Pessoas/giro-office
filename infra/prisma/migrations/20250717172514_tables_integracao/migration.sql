-- CreateTable
CREATE TABLE "permissions.project" (
    "user_id" TEXT NOT NULL,
    "block_tasks" BOOLEAN NOT NULL,
    "urgent_tasks_monitoring" BOOLEAN NOT NULL,

    CONSTRAINT "permissions.project_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "PA" (
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

    CONSTRAINT "PA_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "new_client_sending" BOOLEAN NOT NULL,
    "task_stalled_sending" BOOLEAN NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

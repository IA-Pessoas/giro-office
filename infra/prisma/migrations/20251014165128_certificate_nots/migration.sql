-- CreateTable
CREATE TABLE "certificate.notification" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate.notification_pkey" PRIMARY KEY ("id")
);

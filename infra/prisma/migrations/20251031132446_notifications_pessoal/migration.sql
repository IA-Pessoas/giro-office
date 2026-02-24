/*
  Warnings:

  - You are about to drop the `certificate.notification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "certificate.notification";

-- CreateTable
CREATE TABLE "notification.certificate" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification.certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification.pessoal" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "regarding_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification.pessoal_pkey" PRIMARY KEY ("id")
);

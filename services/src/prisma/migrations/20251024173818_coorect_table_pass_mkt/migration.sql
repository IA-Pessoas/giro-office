/*
  Warnings:

  - You are about to drop the `mtk_passwords` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "mtk_passwords";

-- CreateTable
CREATE TABLE "mtk.passwords" (
    "id" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mtk.passwords_pkey" PRIMARY KEY ("id")
);

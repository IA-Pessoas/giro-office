/*
  Warnings:

  - You are about to drop the column `month_prospecting` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `service` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `solucao` on the `clients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clients" DROP COLUMN "month_prospecting",
DROP COLUMN "service",
DROP COLUMN "solucao";

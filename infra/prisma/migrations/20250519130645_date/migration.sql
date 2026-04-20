/*
  Warnings:

  - The `register_date_prospecting` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "clients" DROP COLUMN "register_date_prospecting",
ADD COLUMN     "register_date_prospecting" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

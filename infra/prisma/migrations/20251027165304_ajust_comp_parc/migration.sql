/*
  Warnings:

  - You are about to drop the column `date` on the `parcelamento.installmentsCompetencies` table. All the data in the column will be lost.
  - Added the required column `competence` to the `parcelamento.installmentsCompetencies` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "parcelamento.installmentsCompetencies" DROP COLUMN "date",
ADD COLUMN     "competence" TEXT NOT NULL;

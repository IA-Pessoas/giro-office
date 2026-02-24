/*
  Warnings:

  - Added the required column `legal_nature` to the `parcelamento.installments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "parcelamento.installments" ADD COLUMN     "legal_nature" TEXT NOT NULL;

/*
  Warnings:

  - Added the required column `regarding` to the `notification.pessoal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "notification.pessoal" ADD COLUMN     "regarding" TEXT NOT NULL;

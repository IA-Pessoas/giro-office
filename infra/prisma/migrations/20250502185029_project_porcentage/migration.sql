/*
  Warnings:

  - Added the required column `porcentage` to the `integracao.projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "integracao.projects" ADD COLUMN     "porcentage" DOUBLE PRECISION NOT NULL;

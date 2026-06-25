/*
  Warnings:

  - Added the required column `department_control_id` to the `agenda` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agenda" ADD COLUMN     "department_control_id" TEXT NOT NULL;

/*
  Warnings:

  - The `task_completion` column on the `permissions.specific` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "permissions.specific" DROP COLUMN "task_completion",
ADD COLUMN     "task_completion" BOOLEAN;

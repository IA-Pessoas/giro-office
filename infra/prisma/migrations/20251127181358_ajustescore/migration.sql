/*
  Warnings:

  - Added the required column `evaluator_role` to the `rh.score_evaluations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "rh.score_evaluations" DROP CONSTRAINT "rh.score_evaluations_evaluator_id_fkey";

-- AlterTable
ALTER TABLE "rh.score_evaluations" ADD COLUMN     "evaluator_role" TEXT NOT NULL,
ALTER COLUMN "evaluator_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "rh.score_evaluations" ADD CONSTRAINT "rh.score_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

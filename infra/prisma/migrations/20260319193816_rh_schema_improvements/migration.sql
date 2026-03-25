/*
  Warnings:

  - You are about to drop the column `launch_in` on the `rh.points` table. All the data in the column will be lost.
  - You are about to drop the column `sender_id` on the `rh.request_messages` table. All the data in the column will be lost.
  - You are about to drop the column `assigned_to_id` on the `rh.requests` table. All the data in the column will be lost.
  - You are about to drop the column `requester_id` on the `rh.requests` table. All the data in the column will be lost.
  - You are about to drop the column `hours` on the `rh.timeBankReleases` table. All the data in the column will be lost.
  - You are about to drop the column `approver_id` on the `rh.timeClockRequest` table. All the data in the column will be lost.
  - You are about to drop the column `launch_in` on the `rh.timeClockRequest` table. All the data in the column will be lost.
  - Changed the type of `start_time` on the `rh.pointConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `lunch_break` on the `rh.pointConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `lunch_return` on the `rh.pointConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `end_time` on the `rh.pointConfig` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `sender_user_id` to the `rh.request_messages` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `rh.request_messages` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `assigned_to_user_id` to the `rh.requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requester_user_id` to the `rh.requests` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `urgency` on the `rh.requests` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `rh.requests` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `rh.score_evaluations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `rh.score_evaluations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `evaluator_role` on the `rh.score_evaluations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `question_id` to the `rh.score_questions` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `rh.score_questions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `minutes` to the `rh.timeBankReleases` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RhRequestUrgency" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "RhRequestStatus" AS ENUM ('New', 'In_Progress', 'Resolved', 'Closed');

-- CreateEnum
CREATE TYPE "RhMessageType" AS ENUM ('Message', 'Solution', 'Rejection', 'Acceptance');

-- CreateEnum
CREATE TYPE "ScoreQuestionType" AS ENUM ('behavioral', 'technical', 'tech', 'leadership');

-- CreateEnum
CREATE TYPE "ScoreEvaluationStatus" AS ENUM ('Pending', 'Completed');

-- CreateEnum
CREATE TYPE "ScoreEvaluatorRole" AS ENUM ('SELF', 'LEADER', 'RH', 'DIRECTOR', 'SUBORDINATE', 'TI');

-- DropForeignKey
ALTER TABLE "rh.request_messages" DROP CONSTRAINT "rh.request_messages_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.requests" DROP CONSTRAINT "rh.requests_assigned_to_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.requests" DROP CONSTRAINT "rh.requests_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.timeClockRequest" DROP CONSTRAINT "rh.timeClockRequest_approver_id_fkey";

-- AlterTable
ALTER TABLE "rh.pointConfig" DROP COLUMN "start_time",
ADD COLUMN     "start_time" TIMESTAMP(3) NOT NULL,
DROP COLUMN "lunch_break",
ADD COLUMN     "lunch_break" TIMESTAMP(3) NOT NULL,
DROP COLUMN "lunch_return",
ADD COLUMN     "lunch_return" TIMESTAMP(3) NOT NULL,
DROP COLUMN "end_time",
ADD COLUMN     "end_time" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "rh.points" DROP COLUMN "launch_in",
ADD COLUMN     "lunch_in" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rh.request_messages" DROP COLUMN "sender_id",
ADD COLUMN     "sender_user_id" TEXT NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "RhMessageType" NOT NULL;

-- AlterTable
ALTER TABLE "rh.requests" DROP COLUMN "assigned_to_id",
DROP COLUMN "requester_id",
ADD COLUMN     "assigned_to_user_id" TEXT NOT NULL,
ADD COLUMN     "requester_user_id" TEXT NOT NULL,
DROP COLUMN "urgency",
ADD COLUMN     "urgency" "RhRequestUrgency" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "RhRequestStatus" NOT NULL;

-- AlterTable
ALTER TABLE "rh.score_evaluations" DROP COLUMN "type",
ADD COLUMN     "type" "ScoreQuestionType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ScoreEvaluationStatus" NOT NULL,
DROP COLUMN "evaluator_role",
ADD COLUMN     "evaluator_role" "ScoreEvaluatorRole" NOT NULL;

-- AlterTable
ALTER TABLE "rh.score_questions" ADD COLUMN     "question_id" TEXT NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "ScoreQuestionType" NOT NULL;

-- AlterTable
ALTER TABLE "rh.timeBankReleases" DROP COLUMN "hours",
ADD COLUMN     "minutes" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "rh.timeClockRequest" DROP COLUMN "approver_id",
DROP COLUMN "launch_in",
ADD COLUMN     "approver_user_id" TEXT,
ADD COLUMN     "lunch_in" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "rh.holidays_organization_id_date_idx" ON "rh.holidays"("organization_id", "date");

-- CreateIndex
CREATE INDEX "rh.points_user_id_clock_in_idx" ON "rh.points"("user_id", "clock_in");

-- CreateIndex
CREATE INDEX "rh.timeSheets_user_id_start_time_idx" ON "rh.timeSheets"("user_id", "start_time");

-- AddForeignKey
ALTER TABLE "rh.timeClockRequest" ADD CONSTRAINT "rh.timeClockRequest_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.request_messages" ADD CONSTRAINT "rh.request_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

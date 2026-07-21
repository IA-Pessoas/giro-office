/*
  Warnings:

  - You are about to drop the `rh.allergies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `rh.colaborators` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `rh.emergencyContacts` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[cpf]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[rg]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "rh.allergies" DROP CONSTRAINT "rh.allergies_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.allergies" DROP CONSTRAINT "rh.allergies_user_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.colaborators" DROP CONSTRAINT "rh.colaborators_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.colaborators" DROP CONSTRAINT "rh.colaborators_user_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.emergencyContacts" DROP CONSTRAINT "rh.emergencyContacts_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.emergencyContacts" DROP CONSTRAINT "rh.emergencyContacts_user_id_fkey";

-- AlterTable
ALTER TABLE "audit_requests" ADD COLUMN     "action" TEXT,
ADD COLUMN     "changes_json" JSONB,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "referring" TEXT,
ADD COLUMN     "referring_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "allergies" JSONB,
ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergency_contacts" JSONB,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hire_date" TIMESTAMP(3),
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "termination_date" TIMESTAMP(3);

-- DropTable
DROP TABLE "rh.allergies";

-- DropTable
DROP TABLE "rh.colaborators";

-- DropTable
DROP TABLE "rh.emergencyContacts";

-- CreateIndex
CREATE INDEX "audit_requests_organization_id_referring_referring_id_creat_idx" ON "audit_requests"("organization_id", "referring", "referring_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "users_rg_key" ON "users"("rg");

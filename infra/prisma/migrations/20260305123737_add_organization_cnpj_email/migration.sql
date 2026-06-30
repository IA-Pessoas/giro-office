/*
  Warnings:

  
You are about to drop the column logo on the organizations table. All the data in the column will be lost.
The status column on the organizations table would be dropped and recreated. This will lead to data loss if there is data in the column.
You are about to drop the column photo on the users table. All the data in the column will be lost.
You are about to drop the logs.pessoal table. If the table is not empty, all the data it contains will be lost.
Added the required column cnpj to the organizations table without a default value. This is not possible if the table is not empty.
Added the required column email_created_by to the organizations table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "status" AS ENUM ('trial', 'past_due', 'active', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "enumType" AS ENUM ('admin', 'owner', 'normal');

-- DropForeignKey
ALTER TABLE "logs.pessoal" DROP CONSTRAINT "logs.pessoal_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "logs.pessoal" DROP CONSTRAINT "logs.pessoal_user_id_fkey";

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "logo",
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "email_created_by" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "subscription_plan" TEXT NOT NULL DEFAULT 'trial',
DROP COLUMN "status",
ADD COLUMN     "status" "status" NOT NULL DEFAULT 'active';

UPDATE "organizations" SET "cnpj" = '12345678901234', "email_created_by" = 'migracao@placeholder.com' WHERE "cnpj" IS NULL;

ALTER TABLE "organizations"ALTER COLUMN "cnpj" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "email_created_by" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "photo",
ADD COLUMN     "invited_by" TEXT,
ADD COLUMN     "joined_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "photo_url" TEXT;

-- DropTable
DROP TABLE "logs.pessoal";
-- CreateTable
CREATE TABLE "organization_users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "enumType" NOT NULL DEFAULT 'normal',

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email_user" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "role" "enumType" NOT NULL DEFAULT 'normal',

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
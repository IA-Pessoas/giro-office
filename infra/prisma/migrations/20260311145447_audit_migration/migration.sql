/*
  Warnings:

  - The values [normal] on the enum `enumType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[cnpj]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "enumType_new" AS ENUM ('admin', 'owner', 'user');
ALTER TABLE "public"."organization_invites" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."organization_users" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "organization_users" ALTER COLUMN "type" TYPE "enumType_new" USING ("type"::text::"enumType_new");
ALTER TABLE "organization_invites" ALTER COLUMN "role" TYPE "enumType_new" USING ("role"::text::"enumType_new");
ALTER TYPE "enumType" RENAME TO "enumType_old";
ALTER TYPE "enumType_new" RENAME TO "enumType";
DROP TYPE "public"."enumType_old";
ALTER TABLE "organization_invites" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "organization_users" ALTER COLUMN "type" SET DEFAULT 'user';
COMMIT;

-- AlterTable
ALTER TABLE "organization_invites" ALTER COLUMN "role" SET DEFAULT 'user';

-- AlterTable
ALTER TABLE "organization_users" ADD COLUMN     "first_owner_flag" BOOLEAN DEFAULT false,
ALTER COLUMN "type" SET DEFAULT 'user';

-- CreateIndex
CREATE UNIQUE INDEX "organizations_cnpj_key" ON "organizations"("cnpj");

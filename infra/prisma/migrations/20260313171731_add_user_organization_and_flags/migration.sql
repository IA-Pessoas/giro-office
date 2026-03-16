/*
  Warnings:

  - You are about to drop the `organization_users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "organization_users" DROP CONSTRAINT "organization_users_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "organization_users" DROP CONSTRAINT "organization_users_user_id_fkey";

-- DropTable
DROP TABLE "organization_users";

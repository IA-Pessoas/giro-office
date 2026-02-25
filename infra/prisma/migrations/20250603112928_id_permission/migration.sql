/*
  Warnings:

  - The primary key for the `permissions.specific` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `permissions.specific` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "permissions.specific" DROP CONSTRAINT "permissions.specific_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "permissions.specific_pkey" PRIMARY KEY ("user_id");

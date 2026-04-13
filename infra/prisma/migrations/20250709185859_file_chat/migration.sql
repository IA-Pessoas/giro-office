/*
  Warnings:

  - You are about to drop the column `fleUrl` on the `chats.messages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "chats.messages" DROP COLUMN "fleUrl",
ADD COLUMN     "fileUrl" TEXT;

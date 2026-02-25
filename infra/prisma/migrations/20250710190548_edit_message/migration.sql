-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "chats.messages" ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false;

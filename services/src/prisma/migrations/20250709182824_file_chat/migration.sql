-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

-- AlterTable
ALTER TABLE "chats.messages" ADD COLUMN     "fleUrl" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT',
ALTER COLUMN "content" DROP NOT NULL;

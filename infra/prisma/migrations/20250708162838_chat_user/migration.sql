/*
  Warnings:

  - A unique constraint covering the columns `[chat_id,user_id]` on the table `chats.participants` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "chats.participants_chat_id_user_id_key" ON "chats.participants"("chat_id", "user_id");

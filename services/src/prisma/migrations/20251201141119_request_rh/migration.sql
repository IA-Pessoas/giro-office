/*
  Warnings:

  - You are about to drop the `rh.exam_questions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `rh.exams` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "rh.exam_questions" DROP CONSTRAINT "rh.exam_questions_exam_id_fkey";

-- DropForeignKey
ALTER TABLE "rh.exams" DROP CONSTRAINT "rh.exams_creator_id_fkey";

-- DropTable
DROP TABLE "rh.exam_questions";

-- DropTable
DROP TABLE "rh.exams";

-- CreateTable
CREATE TABLE "rh.requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh.requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.request_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rh.request_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.request_messages" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachment" TEXT,
    "type" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh.request_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "rh.request_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.request_messages" ADD CONSTRAINT "rh.request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "rh.requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.request_messages" ADD CONSTRAINT "rh.request_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

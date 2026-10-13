CREATE TYPE "RhExamStatus" AS ENUM ('New', 'Open', 'Closed', 'Cancelled');
CREATE TYPE "RhExamParticipantStatus" AS ENUM ('NotStarted', 'Submitted', 'Graded');

CREATE TABLE "rh.exams" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "evaluator_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "window_start" TIMESTAMP(3),
  "window_end" TIMESTAMP(3),
  "observations" TEXT NOT NULL DEFAULT '',
  "status" "RhExamStatus" NOT NULL DEFAULT 'New',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh.exam_participants" (
  "id" TEXT NOT NULL,
  "exam_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "status" "RhExamParticipantStatus" NOT NULL DEFAULT 'NotStarted',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh.exam_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh.exam_questions" (
  "id" TEXT NOT NULL,
  "exam_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "answer_key" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh.exam_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh.exam_answers" (
  "id" TEXT NOT NULL,
  "exam_participant_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "score" DOUBLE PRECISION,
  "feedback" TEXT NOT NULL DEFAULT '',
  "submitted_at" TIMESTAMP(3),
  "graded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.exam_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_rh_exam_participants_exam_user" ON "rh.exam_participants"("exam_id", "user_id");
CREATE INDEX "rh.exam_participants_organization_id_user_id_idx" ON "rh.exam_participants"("organization_id", "user_id");
CREATE UNIQUE INDEX "uq_rh_exam_questions_exam_position" ON "rh.exam_questions"("exam_id", "position");
CREATE INDEX "rh.exam_questions_organization_id_exam_id_idx" ON "rh.exam_questions"("organization_id", "exam_id");
CREATE UNIQUE INDEX "uq_rh_exam_answers_participant_question" ON "rh.exam_answers"("exam_participant_id", "question_id");
CREATE INDEX "rh.exam_answers_organization_id_question_id_idx" ON "rh.exam_answers"("organization_id", "question_id");
CREATE INDEX "rh.exams_organization_id_status_created_at_idx" ON "rh.exams"("organization_id", "status", "created_at");

ALTER TABLE "rh.exams" ADD CONSTRAINT "rh.exams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exams" ADD CONSTRAINT "rh.exams_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exams" ADD CONSTRAINT "rh.exams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exam_participants" ADD CONSTRAINT "rh.exam_participants_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "rh.exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh.exam_participants" ADD CONSTRAINT "rh.exam_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exam_participants" ADD CONSTRAINT "rh.exam_participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exam_questions" ADD CONSTRAINT "rh.exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "rh.exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh.exam_questions" ADD CONSTRAINT "rh.exam_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.exam_answers" ADD CONSTRAINT "rh.exam_answers_exam_participant_id_fkey" FOREIGN KEY ("exam_participant_id") REFERENCES "rh.exam_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh.exam_answers" ADD CONSTRAINT "rh.exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "rh.exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh.exam_answers" ADD CONSTRAINT "rh.exam_answers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

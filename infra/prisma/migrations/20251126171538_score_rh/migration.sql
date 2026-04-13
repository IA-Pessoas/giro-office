-- CreateTable
CREATE TABLE "rh.score" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "behavioral" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "technical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "technology" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadership" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh.score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.score_nitro" (
    "id" TEXT NOT NULL,
    "score_id" TEXT NOT NULL,
    "projects_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hours_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "folders_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_hours" INTEGER NOT NULL DEFAULT 0,
    "total_errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rh.score_nitro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.score_questions" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rh.score_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.score_evaluations" (
    "id" TEXT NOT NULL,
    "score_id" TEXT NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "average_score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "rh.score_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "observation" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "rh.exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh.exam_questions" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "rh.exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rh.score_user_id_quarter_key" ON "rh.score"("user_id", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "rh.score_nitro_score_id_key" ON "rh.score_nitro"("score_id");

-- AddForeignKey
ALTER TABLE "rh.score" ADD CONSTRAINT "rh.score_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_nitro" ADD CONSTRAINT "rh.score_nitro_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "rh.score"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_evaluations" ADD CONSTRAINT "rh.score_evaluations_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "rh.score"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_evaluations" ADD CONSTRAINT "rh.score_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.exams" ADD CONSTRAINT "rh.exams_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.exam_questions" ADD CONSTRAINT "rh.exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "rh.exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

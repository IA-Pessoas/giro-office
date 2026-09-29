ALTER TABLE "mtk.event_editions"
  ADD COLUMN "feedback_period_start" TIMESTAMP(3),
  ADD COLUMN "feedback_period_end" TIMESTAMP(3),
  ADD CONSTRAINT "mtk.event_editions_feedback_period_check"
    CHECK (
      ("feedback_period_start" IS NULL AND "feedback_period_end" IS NULL)
      OR (
        "feedback_period_start" IS NOT NULL
        AND "feedback_period_end" IS NOT NULL
        AND "feedback_period_start" <= "feedback_period_end"
      )
    );

CREATE TABLE "mtk.event_edition_feedback" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "edition_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "observation" TEXT,
  "evaluated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mtk.event_edition_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mtk.event_edition_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "mtk.event_edition_feedback_edition_organization_fkey"
    FOREIGN KEY ("edition_id", "organization_id")
    REFERENCES "mtk.event_editions" ("id", "organization_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mtk.event_edition_feedback_edition_unique"
  ON "mtk.event_edition_feedback" ("edition_id", "organization_id");

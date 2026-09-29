CREATE UNIQUE INDEX "mtk.events_id_organization_unique"
  ON "mtk.events" ("id", "organization_id");

CREATE TABLE "mtk.event_editions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "legacy_id" INTEGER,
  "name" VARCHAR(100) NOT NULL,
  "date" DATE NOT NULL,
  "place" VARCHAR(255) NOT NULL,
  "partnerships" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "organizing_team" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "logistics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "marketing_communication" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "during_event" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "after_event" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mtk.event_editions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mtk.event_editions_event_organization_fkey"
    FOREIGN KEY ("event_id", "organization_id")
    REFERENCES "mtk.events" ("id", "organization_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mtk.event_editions_id_organization_unique"
  ON "mtk.event_editions" ("id", "organization_id");
CREATE UNIQUE INDEX "mtk.event_editions_organization_legacy_unique"
  ON "mtk.event_editions" ("organization_id", "legacy_id");
CREATE INDEX "mtk.event_editions_event_date_idx"
  ON "mtk.event_editions" ("organization_id", "event_id", "date");

CREATE TABLE "mtk.event_edition_budget_items" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "edition_id" TEXT NOT NULL,
  "legacy_id" VARCHAR(100),
  "name" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mtk.event_edition_budget_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mtk.event_edition_budget_items_amount_nonnegative_check" CHECK ("amount" >= 0),
  CONSTRAINT "mtk.event_edition_budget_items_edition_organization_fkey"
    FOREIGN KEY ("edition_id", "organization_id")
    REFERENCES "mtk.event_editions" ("id", "organization_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mtk.event_edition_budget_items_id_organization_unique"
  ON "mtk.event_edition_budget_items" ("id", "organization_id");
CREATE UNIQUE INDEX "mtk.event_edition_budget_items_edition_legacy_unique"
  ON "mtk.event_edition_budget_items" ("organization_id", "edition_id", "legacy_id");
CREATE INDEX "mtk.event_edition_budget_items_edition_idx"
  ON "mtk.event_edition_budget_items" ("organization_id", "edition_id", "position");

CREATE TABLE "fiscal.annual_controls" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "regime" TEXT,
  "responsible_id" TEXT,
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.annual_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.annual_controls_year_check" CHECK ("year" BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX "uq_fiscal_annual_controls_org_client_year"
  ON "fiscal.annual_controls" ("organization_id", "client_id", "year");

CREATE INDEX "idx_fiscal_annual_controls_org_year"
  ON "fiscal.annual_controls" ("organization_id", "year");

CREATE TABLE "fiscal.annual_control_items" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "control_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "applicable" BOOLEAN NOT NULL DEFAULT true,
  "not_applicable_reason" TEXT,
  "completed_on" DATE,
  "completed_by" TEXT,
  "protocol" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.annual_control_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.annual_control_items_origin_check" CHECK ("origin" IN ('SUGGESTED', 'MANUAL')),
  -- Não aplicável sempre com motivo; cumprida sempre com ator e nunca não aplicável.
  CONSTRAINT "fiscal.annual_control_items_reason_check"
    CHECK ("applicable" OR "not_applicable_reason" IS NOT NULL),
  CONSTRAINT "fiscal.annual_control_items_completion_check"
    CHECK ("completed_on" IS NULL OR ("applicable" AND "completed_by" IS NOT NULL)),
  CONSTRAINT "fiscal.annual_control_items_control_id_fkey" FOREIGN KEY ("control_id")
    REFERENCES "fiscal.annual_controls" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_fiscal_annual_control_items_control_code"
  ON "fiscal.annual_control_items" ("control_id", "code");

CREATE INDEX "idx_fiscal_annual_control_items_org_control"
  ON "fiscal.annual_control_items" ("organization_id", "control_id");

CREATE TABLE "fiscal.annual_control_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "control_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "item_code" TEXT,
  "from_value" TEXT,
  "to_value" TEXT,
  "reason" TEXT,
  "actor_id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.annual_control_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.annual_control_events_control_id_fkey" FOREIGN KEY ("control_id")
    REFERENCES "fiscal.annual_controls" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_fiscal_annual_control_events_control_created"
  ON "fiscal.annual_control_events" ("control_id", "createdAt");

CREATE TABLE "fiscal.monthly_controls" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "competence" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "no_movement" BOOLEAN NOT NULL DEFAULT false,
  "regime" TEXT,
  "opening_reason" TEXT,
  "created_by" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal.monthly_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.monthly_controls_status_check"
    CHECK ("status" IN ('PENDING', 'IN_PROGRESS', 'AWAITING_CLIENT', 'COMPLETED')),
  CONSTRAINT "fiscal.monthly_controls_competence_check" CHECK (EXTRACT(DAY FROM "competence") = 1)
);

CREATE UNIQUE INDEX "uq_fiscal_monthly_controls_org_client_competence"
  ON "fiscal.monthly_controls" ("organization_id", "client_id", "competence");

CREATE INDEX "idx_fiscal_monthly_controls_org_competence"
  ON "fiscal.monthly_controls" ("organization_id", "competence");

CREATE TABLE "fiscal.monthly_control_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "control_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "from_value" TEXT,
  "to_value" TEXT,
  "reason" TEXT,
  "actor_id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal.monthly_control_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.monthly_control_events_control_id_fkey" FOREIGN KEY ("control_id")
    REFERENCES "fiscal.monthly_controls" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_fiscal_monthly_control_events_control_created"
  ON "fiscal.monthly_control_events" ("control_id", "createdAt");

ALTER TABLE "fiscal.monthly_control_events" ADD COLUMN "obligation_code" TEXT;

CREATE TABLE "fiscal.monthly_control_obligations" (
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
  CONSTRAINT "fiscal.monthly_control_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal.monthly_control_obligations_origin_check"
    CHECK ("origin" IN ('SUGGESTED', 'MANUAL')),
  -- Não aplicável sempre com motivo; cumprida sempre com ator e nunca não aplicável.
  CONSTRAINT "fiscal.monthly_control_obligations_reason_check"
    CHECK ("applicable" OR "not_applicable_reason" IS NOT NULL),
  CONSTRAINT "fiscal.monthly_control_obligations_completion_check"
    CHECK ("completed_on" IS NULL OR ("applicable" AND "completed_by" IS NOT NULL)),
  CONSTRAINT "fiscal.monthly_control_obligations_control_id_fkey" FOREIGN KEY ("control_id")
    REFERENCES "fiscal.monthly_controls" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_fiscal_monthly_control_obligations_control_code"
  ON "fiscal.monthly_control_obligations" ("control_id", "code");

CREATE INDEX "idx_fiscal_monthly_control_obligations_org_control"
  ON "fiscal.monthly_control_obligations" ("organization_id", "control_id");

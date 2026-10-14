CREATE TABLE "rh"."vacation_periods" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "period_start" DATE,
  "period_end" DATE,
  "acquisition_start" DATE,
  "acquisition_end" DATE,
  "legacy_period_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vacation_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vacation_periods_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vacation_periods_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_rh_vacation_period_org_legacy_id"
  ON "rh"."vacation_periods" ("organization_id", "legacy_period_id");
CREATE UNIQUE INDEX "uq_rh_vacation_period_id_org"
  ON "rh"."vacation_periods" ("id", "organization_id");
CREATE INDEX "idx_rh_vacation_period_org_employee_acquisition"
  ON "rh"."vacation_periods" ("organization_id", "employee_id", "acquisition_start");

CREATE TABLE "rh"."vacation_usages" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "observation" TEXT,
  "legacy_usage_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vacation_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vacation_usages_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vacation_usages_period_id_organization_id_fkey"
    FOREIGN KEY ("period_id", "organization_id")
    REFERENCES "rh"."vacation_periods"("id", "organization_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_rh_vacation_usage_org_legacy_id"
  ON "rh"."vacation_usages" ("organization_id", "legacy_usage_id");
CREATE INDEX "idx_rh_vacation_usage_org_period_start"
  ON "rh"."vacation_usages" ("organization_id", "period_id", "start_date");

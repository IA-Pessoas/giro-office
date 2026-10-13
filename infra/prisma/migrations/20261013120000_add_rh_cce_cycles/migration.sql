-- Ciclos e avaliações semanais do CCE, separados do Score trimestral/Nitro.
-- floor_count aceita 0–4; o comportamento legado gera os andares 0–3.
CREATE TABLE "rh.cce_floor_configuration" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "floor_count" INTEGER NOT NULL DEFAULT 4,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.cce_floor_configuration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_cce_floor_configuration_floor_count" CHECK ("floor_count" BETWEEN 0 AND 4)
);

CREATE TABLE "rh.cce_cycle" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.cce_cycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_cce_cycle_month" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "ck_cce_cycle_year" CHECK ("year" BETWEEN 1 AND 9999)
);

CREATE TABLE "rh.cce_weekly_evaluation" (
  "id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "week" INTEGER NOT NULL,
  "monitor_user_id" TEXT,
  "evaluated_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "organization" BOOLEAN NOT NULL DEFAULT false,
  "cleanliness" BOOLEAN NOT NULL DEFAULT false,
  "delays" BOOLEAN NOT NULL DEFAULT false,
  "cellphone" BOOLEAN NOT NULL DEFAULT false,
  "conversations" BOOLEAN NOT NULL DEFAULT false,
  "demands" BOOLEAN NOT NULL DEFAULT false,
  "dress_code" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "rh.cce_weekly_evaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_cce_weekly_evaluation_floor" CHECK ("floor" BETWEEN 0 AND 3),
  CONSTRAINT "ck_cce_weekly_evaluation_week" CHECK ("week" BETWEEN 1 AND 4)
);

CREATE UNIQUE INDEX "rh.cce_floor_configuration_organization_id_key"
  ON "rh.cce_floor_configuration"("organization_id");
CREATE UNIQUE INDEX "uq_cce_cycle_org_year_month"
  ON "rh.cce_cycle"("organization_id", "year", "month");
CREATE UNIQUE INDEX "uq_cce_week_cycle_floor_week"
  ON "rh.cce_weekly_evaluation"("cycle_id", "floor", "week");
CREATE INDEX "rh.cce_weekly_evaluation_cycle_id_week_idx"
  ON "rh.cce_weekly_evaluation"("cycle_id", "week");

ALTER TABLE "rh.cce_floor_configuration"
  ADD CONSTRAINT "rh.cce_floor_configuration_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh.cce_cycle"
  ADD CONSTRAINT "rh.cce_cycle_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rh.cce_cycle"
  ADD CONSTRAINT "rh.cce_cycle_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh.cce_weekly_evaluation"
  ADD CONSTRAINT "rh.cce_weekly_evaluation_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "rh.cce_cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh.cce_weekly_evaluation"
  ADD CONSTRAINT "rh.cce_weekly_evaluation_monitor_user_id_fkey"
  FOREIGN KEY ("monitor_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

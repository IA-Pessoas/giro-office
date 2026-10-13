CREATE TYPE "rh.life_objective_status" AS ENUM ('ToDo', 'Realized', 'Discontinued');

CREATE TABLE "rh.life_projects" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "life_story" TEXT NOT NULL DEFAULT '',
  "company_story" TEXT NOT NULL DEFAULT '',
  "created_by_id" TEXT NOT NULL,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.life_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh.life_project_objectives" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "forecast_date" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "status" "rh.life_objective_status" NOT NULL DEFAULT 'ToDo',
  "rh_observations" TEXT NOT NULL DEFAULT '',
  "employee_observations" TEXT NOT NULL DEFAULT '',
  "created_by_id" TEXT NOT NULL,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.life_project_objectives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_rh_life_projects_org_user_year"
  ON "rh.life_projects"("organization_id", "user_id", "year");
CREATE INDEX "rh.life_projects_organization_id_year_idx"
  ON "rh.life_projects"("organization_id", "year");
CREATE INDEX "rh.life_project_objectives_organization_id_project_id_status_idx"
  ON "rh.life_project_objectives"("organization_id", "project_id", "status");

ALTER TABLE "rh.life_projects"
  ADD CONSTRAINT "rh.life_projects_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_projects_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_projects_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh.life_project_objectives"
  ADD CONSTRAINT "rh.life_project_objectives_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_project_objectives_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "rh.life_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_project_objectives_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.life_project_objectives_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

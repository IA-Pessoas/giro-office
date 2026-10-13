CREATE TABLE "rh.employee_meeting_minutes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "meeting_date" DATE NOT NULL,
  "agenda" VARCHAR(500) NOT NULL,
  "agenda_key" VARCHAR(500) NOT NULL,
  "participants" TEXT NOT NULL DEFAULT '',
  "report" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_id" TEXT NOT NULL,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.employee_meeting_minutes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh.employee_meeting_minute_revisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "minute_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "meeting_date" DATE NOT NULL,
  "agenda" VARCHAR(500) NOT NULL,
  "participants" TEXT NOT NULL,
  "report" TEXT NOT NULL,
  "changed_by_id" TEXT NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rh.employee_meeting_minute_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_rh_employee_meeting_minutes_org_user_date_agenda"
  ON "rh.employee_meeting_minutes"("organization_id", "user_id", "meeting_date", "agenda_key");
CREATE INDEX "rh.employee_meeting_minutes_organization_id_user_id_meeting_date_idx"
  ON "rh.employee_meeting_minutes"("organization_id", "user_id", "meeting_date");
CREATE UNIQUE INDEX "uq_rh_employee_meeting_minute_revisions_minute_version"
  ON "rh.employee_meeting_minute_revisions"("minute_id", "version");
CREATE INDEX "rh.employee_meeting_minute_revisions_organization_id_minute_id_changed_at_idx"
  ON "rh.employee_meeting_minute_revisions"("organization_id", "minute_id", "changed_at");

ALTER TABLE "rh.employee_meeting_minutes"
  ADD CONSTRAINT "rh.employee_meeting_minutes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.employee_meeting_minutes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.employee_meeting_minutes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.employee_meeting_minutes_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rh.employee_meeting_minute_revisions"
  ADD CONSTRAINT "rh.employee_meeting_minute_revisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.employee_meeting_minute_revisions_minute_id_fkey"
    FOREIGN KEY ("minute_id") REFERENCES "rh.employee_meeting_minutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.employee_meeting_minute_revisions_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

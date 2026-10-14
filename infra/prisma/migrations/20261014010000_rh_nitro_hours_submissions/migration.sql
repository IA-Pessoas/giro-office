CREATE TYPE "RhNitroHoursStatus" AS ENUM ('Pending', 'Accepted', 'Rejected');

CREATE TABLE "rh.nitro_hours_submissions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "quarter" TEXT NOT NULL,
  "hours" INTEGER NOT NULL,
  "status" "RhNitroHoursStatus" NOT NULL DEFAULT 'Pending',
  "certificate_path" TEXT NOT NULL,
  "certificate_mime" TEXT NOT NULL,
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rh.nitro_hours_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rh.nitro_hours_organization_quarter_status_idx"
  ON "rh.nitro_hours_submissions"("organization_id", "quarter", "status");
CREATE INDEX "rh.nitro_hours_organization_user_quarter_idx"
  ON "rh.nitro_hours_submissions"("organization_id", "user_id", "quarter");

ALTER TABLE "rh.nitro_hours_submissions"
  ADD CONSTRAINT "rh.nitro_hours_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "rh.nitro_hours_submissions_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

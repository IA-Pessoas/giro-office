-- Persist generated RH timesheet snapshots.
ALTER TABLE "rh.timeSheets"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Gerada',
ADD COLUMN "days" JSONB,
ADD COLUMN "totals" JSONB;

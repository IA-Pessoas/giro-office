ALTER TABLE "reports.jobs"
  ALTER COLUMN "status" SET DEFAULT 'queued';

UPDATE "reports.jobs"
SET "status" = CASE "status"
  WHEN 'pending' THEN 'queued'
  WHEN 'running' THEN 'processing'
  ELSE "status"
END
WHERE "status" IN ('pending', 'running');

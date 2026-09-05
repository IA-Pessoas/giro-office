DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "organization_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require users.organization_id while NULL rows exist.';
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "organization_id" SET NOT NULL;

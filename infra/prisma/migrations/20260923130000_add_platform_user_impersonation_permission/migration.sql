ALTER TABLE "platform_users"
  ADD COLUMN "can_impersonate" BOOLEAN NOT NULL DEFAULT false;

UPDATE "platform_users"
SET "can_impersonate" = true
WHERE "email" = 'eed.jrr@gmail.com';

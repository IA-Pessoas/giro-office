ALTER TABLE "auth_sessions"
ADD COLUMN "impersonator_platform_user_id" TEXT;

CREATE INDEX "idx_auth_sessions_impersonator_platform_user_id"
ON "auth_sessions"("impersonator_platform_user_id");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_impersonator_platform_user_id_fkey"
FOREIGN KEY ("impersonator_platform_user_id")
REFERENCES "platform_users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

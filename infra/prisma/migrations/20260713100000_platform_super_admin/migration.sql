CREATE TYPE "PlatformRole" AS ENUM ('super_admin');
CREATE TYPE "SupportSessionStatus" AS ENUM ('active', 'closed', 'expired');

CREATE TABLE "platform_users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "platform_role" "PlatformRole" NOT NULL DEFAULT 'super_admin',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

CREATE TABLE "platform_support_sessions" (
  "id" TEXT NOT NULL,
  "platform_user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "SupportSessionStatus" NOT NULL DEFAULT 'active',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_support_sessions_platform_status_started"
  ON "platform_support_sessions"("platform_user_id", "status", "started_at" DESC);

CREATE INDEX "idx_support_sessions_org_started"
  ON "platform_support_sessions"("organization_id", "started_at" DESC);

CREATE INDEX CONCURRENTLY "idx_audit_requests_created_at_desc"
  ON "audit_requests"("created_at" DESC);

ALTER TABLE "platform_support_sessions"
  ADD CONSTRAINT "platform_support_sessions_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_support_sessions"
  ADD CONSTRAINT "platform_support_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reports.grant_uses" (
  "id" TEXT NOT NULL,
  "grant_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reports.grant_uses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reports.grant_uses_grant_hash_key"
  ON "reports.grant_uses" ("grant_hash");

CREATE INDEX "reports.grant_uses_expires_at_idx"
  ON "reports.grant_uses" ("expires_at");

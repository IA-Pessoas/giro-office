-- CreateTable
CREATE TABLE "audit_requests" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "permission" INTEGER,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query_json" JSONB,
    "status_code" INTEGER,
    "outcome" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "ip" TEXT,
    "user_agent" TEXT,
    "origin" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "service_source" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "audit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_requests_request_id_key" ON "audit_requests"("request_id");

-- CreateIndex
CREATE INDEX "audit_requests_organization_id_created_at_idx" ON "audit_requests"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_requests_user_id_created_at_idx" ON "audit_requests"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_requests_path_created_at_idx" ON "audit_requests"("path", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_requests_status_code_created_at_idx" ON "audit_requests"("status_code", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

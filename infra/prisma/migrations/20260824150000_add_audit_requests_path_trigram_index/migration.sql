CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX "idx_audit_requests_path_trgm"
ON "audit_requests" USING GIN ("path" gin_trgm_ops);

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Keep audit writes available while this potentially large index is built.
-- PostgreSQL requires this statement to run outside an explicit transaction.
CREATE INDEX CONCURRENTLY "idx_audit_requests_path_trgm"
ON "audit_requests" USING GIN ("path" gin_trgm_ops);

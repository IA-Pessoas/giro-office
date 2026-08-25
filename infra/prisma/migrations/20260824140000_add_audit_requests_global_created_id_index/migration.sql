CREATE INDEX "idx_audit_requests_created_id_desc"
ON "audit_requests"("created_at" DESC, "id" DESC);

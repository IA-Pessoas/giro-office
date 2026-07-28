CREATE INDEX IF NOT EXISTS "idx_tecnologia_requests_org_requester_status_updated"
  ON "tecnologia.requests" ("organization_id", "requester_id", "status", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_requests_org_requester_urgency_status"
  ON "tecnologia.requests" ("organization_id", "requester_id", "urgency", "status");

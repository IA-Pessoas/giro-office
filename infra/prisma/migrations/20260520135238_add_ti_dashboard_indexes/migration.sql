CREATE INDEX IF NOT EXISTS "idx_departments_org_name"
  ON "departments" ("organization_id", "name");

CREATE INDEX IF NOT EXISTS "idx_stock_org_department_status_quantity"
  ON "stock" ("organization_id", "department_id", "status", "quantity");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_inventory_org_user"
  ON "tecnologia.inventory" ("organization_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_terms_org_reason"
  ON "tecnologia.terms" ("organization_id", "reason");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_requests_org_status_updated"
  ON "tecnologia.requests" ("organization_id", "status", "updated_at");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_requests_org_urgency_status"
  ON "tecnologia.requests" ("organization_id", "urgency", "status");

CREATE INDEX IF NOT EXISTS "idx_tecnologia_robots_org_active"
  ON "tecnologia.robots" ("organization_id", "active");

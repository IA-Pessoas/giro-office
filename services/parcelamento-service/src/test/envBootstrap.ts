process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/db";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
process.env.AUDIT_SERVICE_TOKEN = process.env.AUDIT_SERVICE_TOKEN ?? "test-audit-token";
process.env.REPORTS_INTERNAL_TOKEN =
  process.env.REPORTS_INTERNAL_TOKEN ?? "test-reports-internal-token";
process.env.REPORTS_GRANT_SECRET = process.env.REPORTS_GRANT_SECRET ?? "test-reports-grant-secret";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

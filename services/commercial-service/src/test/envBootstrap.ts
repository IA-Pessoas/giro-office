process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/giro_test";
process.env.JWT_SECRET ??= "test-secret";
process.env.AUDIT_ENABLED ??= "false";
process.env.AUDIT_SERVICE_TOKEN ??= "audit-service-token";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
process.env.JWT_SECRET ??= "test-jwt-secret-32-characters-minimum";
process.env.AUDIT_SERVICE_TOKEN ??= "test-audit-token";
process.env.INTERNAL_SERVICE_TOKEN ??= "test-audit-token";
process.env.NODE_ENV ??= "test";

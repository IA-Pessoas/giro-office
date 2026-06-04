process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret";
process.env.AUDIT_SERVICE_URL ??= "http://localhost:3020";
process.env.AUDIT_SERVICE_TOKEN ??= "audit-service-token";
process.env.PESSOAL_PASSWORD_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString("base64");
process.env.NODE_ENV ??= "test";

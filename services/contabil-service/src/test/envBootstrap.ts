/**
 * Garante variáveis exigidas por `getContabilServiceEnv` / Prisma antes de importar módulos de produção nos testes.
 */
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
process.env.JWT_SECRET ??= "unit-test-jwt-secret-32-chars-minimum!";
process.env.AUDIT_SERVICE_TOKEN ??= "audit-service-token";
process.env.INTERNAL_SERVICE_TOKEN ??= "audit-service-token";
process.env.REPORTS_INTERNAL_TOKEN ??= "test-reports-internal-token";
process.env.REPORTS_GRANT_SECRET ??= "test-reports-grant-secret";

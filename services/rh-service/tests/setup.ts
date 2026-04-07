process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/rh_service_test";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-characters-long";
process.env.LOG_LEVEL ??= "silent";
process.env.NODE_ENV ??= "test";

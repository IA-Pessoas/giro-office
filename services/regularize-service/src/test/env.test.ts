import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getRegularizeServiceEnv } from "../config/env.js";

const originalEnv = process.env;

function setBaseEnv() {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    PORT: "3039",
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "secret",
    AUDIT_SERVICE_TOKEN: "audit-token",
    MTK_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    REGULARIZE_LICENSE_PROTOCOL_BUCKET: "regularize-license-protocols",
    SERVICE_ALLOWED_ORIGINS: "*",
    ENABLE_API_DOCS: "false",
  };
  delete process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN;
  delete process.env.INTERNAL_SERVICE_TOKEN;
}

describe("regularize service env", () => {
  beforeEach(() => {
    setBaseEnv();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses INTERNAL_SERVICE_TOKEN when configured", () => {
    process.env.INTERNAL_SERVICE_TOKEN = "internal-token";

    const env = getRegularizeServiceEnv();

    expect(env.internalServiceToken).toBe("internal-token");
  });

  it("prefers the scoped internal token when configured", () => {
    process.env.INTERNAL_SERVICE_TOKEN = "internal-token";
    process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN = "regularize-token";

    const env = getRegularizeServiceEnv();

    expect(env.internalServiceToken).toBe("regularize-token");
  });

  it("falls back to AUDIT_SERVICE_TOKEN when INTERNAL_SERVICE_TOKEN is empty", () => {
    process.env.INTERNAL_SERVICE_TOKEN = "";

    const env = getRegularizeServiceEnv();

    expect(env.internalServiceToken).toBe("audit-token");
  });
});

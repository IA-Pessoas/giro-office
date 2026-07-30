import { afterEach, describe, expect, it } from "vitest";

import { getClientServiceEnv } from "./env.js";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
}

function setClientServiceEnv(nodeEnv: string) {
  restoreEnv();
  process.env.NODE_ENV = nodeEnv;
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";
  process.env.AUDIT_SERVICE_TOKEN = "secure-audit-service-token-with-32-chars";
  process.env.SERVICE_ALLOWED_ORIGINS = "https://app.example.com";
  delete process.env.CLIENT_SERVICE_INTERNAL_TOKEN;
}

describe("client-service env security validation", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("requires a dedicated client-service token in production", () => {
    setClientServiceEnv("production");

    expect(() => getClientServiceEnv()).toThrow(/CLIENT_SERVICE_INTERNAL_TOKEN/);
  });

  it("allows the audit token fallback outside production", () => {
    setClientServiceEnv("development");

    expect(getClientServiceEnv().internalServiceToken).toBe(process.env.AUDIT_SERVICE_TOKEN);
  });
});

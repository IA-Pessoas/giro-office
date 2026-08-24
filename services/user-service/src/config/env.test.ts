import { afterEach, describe, expect, it } from "vitest";

import { getUserServiceEnv } from "./env.js";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
}

function setUserServiceEnv(overrides: NodeJS.ProcessEnv) {
  restoreEnv();
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.JWT_SECRET = "test-secret";
  process.env.ADMIN_PASSWORD = "admin-password";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.AUDIT_SERVICE_TOKEN = "secure-internal-token-with-at-least-32-chars";
  process.env.USER_SERVICE_INTERNAL_TOKEN = "secure-user-service-token-with-at-least-32-chars";
  process.env.REPORTS_INTERNAL_TOKEN = "reports-internal-token-with-at-least-32-chars";
  process.env.SERVICE_ALLOWED_ORIGINS = "https://app.example.com";
  Object.assign(process.env, overrides);
}

describe("user-service env security validation", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("rejects the default internal service token in production", () => {
    setUserServiceEnv({ AUDIT_SERVICE_TOKEN: "audit-service-token" });

    expect(() => getUserServiceEnv()).toThrow(/AUDIT_SERVICE_TOKEN/);
  });

  it("rejects wildcard service CORS origins in production", () => {
    setUserServiceEnv({ SERVICE_ALLOWED_ORIGINS: "*" });

    expect(() => getUserServiceEnv()).toThrow(/SERVICE_ALLOWED_ORIGINS/);
  });

  it("enables secure auth cookies by default in production", () => {
    setUserServiceEnv({});

    expect(getUserServiceEnv().authCookieSecure).toBe(true);
  });

  it("allows an explicit HTTP override outside production and rejects ambiguous values", () => {
    setUserServiceEnv({ NODE_ENV: "development", AUTH_COOKIE_SECURE: "false" });
    expect(getUserServiceEnv().authCookieSecure).toBe(false);

    setUserServiceEnv({ AUTH_COOKIE_SECURE: "maybe" });
    expect(() => getUserServiceEnv()).toThrow();
  });

  it("rejects insecure auth cookies in production", () => {
    setUserServiceEnv({ AUTH_COOKIE_SECURE: "false" });

    expect(() => getUserServiceEnv()).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it("requires a dedicated gateway token in production", () => {
    setUserServiceEnv({});
    delete process.env.USER_SERVICE_INTERNAL_TOKEN;

    expect(() => getUserServiceEnv()).toThrow(/USER_SERVICE_INTERNAL_TOKEN/);
  });

  it("rejects the reports internal token in production when it is not secure", () => {
    setUserServiceEnv({ REPORTS_INTERNAL_TOKEN: "reports-service-token" });

    expect(() => getUserServiceEnv()).toThrow(/REPORTS_INTERNAL_TOKEN/);
  });
});

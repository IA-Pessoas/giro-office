import { afterEach, describe, expect, it } from "vitest";

import { getOrganizationEnv } from "./env.js";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
}

function setOrganizationEnv(overrides: NodeJS.ProcessEnv = {}) {
  restoreEnv();
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.JWT_SECRET = "test-secret";
  process.env.AUDIT_SERVICE_TOKEN = "secure-internal-token-with-at-least-32-chars";
  process.env.SERVICE_ALLOWED_ORIGINS = "https://app.example.com";
  Object.assign(process.env, overrides);
}

describe("organization-service env security validation", () => {
  afterEach(restoreEnv);

  it.each([
    "audit-service-token",
    "short-token",
  ])("rejects insecure AUDIT_SERVICE_TOKEN in production: %s", (auditServiceToken) => {
    setOrganizationEnv({ AUDIT_SERVICE_TOKEN: auditServiceToken });

    expect(() => getOrganizationEnv()).toThrow(/AUDIT_SERVICE_TOKEN/);
  });

  it("accepts an explicit strong internal token in production", () => {
    setOrganizationEnv();

    expect(getOrganizationEnv().auditServiceToken).toBe(
      "secure-internal-token-with-at-least-32-chars",
    );
  });

  it("preserves the default token for local development", () => {
    setOrganizationEnv({
      NODE_ENV: "development",
      AUDIT_SERVICE_TOKEN: "audit-service-token",
      SERVICE_ALLOWED_ORIGINS: "*",
    });

    expect(getOrganizationEnv().auditServiceToken).toBe("audit-service-token");
  });

  it("uses the internal audit-service URL and enables domain audit by default", () => {
    // Falha detectada: o serviço deixa de auditar organizações quando as novas envs são omitidas.
    setOrganizationEnv({ NODE_ENV: "development", SERVICE_ALLOWED_ORIGINS: "*" });

    expect(getOrganizationEnv()).toMatchObject({
      auditServiceUrl: "http://audit-service:3020",
      organizationDomainAuditEnabled: true,
    });
  });

  it("allows organization domain audit to be disabled explicitly", () => {
    // Falha detectada: a flag textual "false" é interpretada como auditoria habilitada.
    setOrganizationEnv({
      NODE_ENV: "development",
      ORGANIZATION_DOMAIN_AUDIT_ENABLED: "false",
      SERVICE_ALLOWED_ORIGINS: "*",
    });

    expect(getOrganizationEnv().organizationDomainAuditEnabled).toBe(false);
  });
});

import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { parseParcelamentoServiceEnv } from "../config/env.js";

describe("parcelamento-service env", () => {
  it("aplica defaults de porta, auditoria e docs fora de producao", () => {
    const env = parseParcelamentoServiceEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      JWT_SECRET: "test-jwt-secret",
      AUDIT_SERVICE_TOKEN: "test-audit-token",
    });

    expect(env.port).toBe(3043);
    expect(env.auditServiceUrl).toBe("http://localhost:3020");
    expect(env.enableApiDocs).toBe(true);
  });

  it("rejeita origins wildcard em producao", () => {
    expect(() =>
      parseParcelamentoServiceEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        JWT_SECRET: "test-jwt-secret",
        AUDIT_SERVICE_TOKEN: "a".repeat(32),
        REPORTS_INTERNAL_TOKEN: "b".repeat(32),
        REPORTS_GRANT_SECRET: "c".repeat(32),
        SERVICE_ALLOWED_ORIGINS: "*",
      }),
    ).toThrow(/SERVICE_ALLOWED_ORIGINS/);
  });
});

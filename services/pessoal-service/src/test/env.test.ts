import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { parsePessoalServiceEnv } from "../config/env.js";

const validBaseEnv = {
  NODE_ENV: "production",
  PORT: "3042",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/prod",
  JWT_SECRET: "jwt-secret",
  AUDIT_SERVICE_URL: "http://audit-service:3020",
  AUDIT_SERVICE_TOKEN: "a".repeat(32),
  PESSOAL_PASSWORD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION: "v1",
  PESSOAL_DOMAIN_AUDIT_ENABLED: "true",
  SERVICE_ALLOWED_ORIGINS: "https://app.example.com",
};

describe("pessoal-service env", () => {
  it("exige INTERNAL_SERVICE_TOKEN explicito em producao", () => {
    expect(() => parsePessoalServiceEnv(validBaseEnv)).toThrow(/INTERNAL_SERVICE_TOKEN/);
  });

  it("mantem fallback para INTERNAL_SERVICE_TOKEN fora de producao", () => {
    const env = parsePessoalServiceEnv({
      ...validBaseEnv,
      NODE_ENV: "test",
      SERVICE_ALLOWED_ORIGINS: "*",
    });

    expect(env.internalServiceToken).toBe(validBaseEnv.AUDIT_SERVICE_TOKEN);
  });
});

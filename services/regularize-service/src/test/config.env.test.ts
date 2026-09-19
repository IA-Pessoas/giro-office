import "./envBootstrap.js";

import { afterEach, describe, expect, it } from "vitest";

import { getRegularizeServiceEnv } from "../config/env.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalGrantSecret = process.env.REGULARIZE_REPORTING_GRANT_SECRET;
const originalRegularizeInternalToken = process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalGrantSecret === undefined) {
    delete process.env.REGULARIZE_REPORTING_GRANT_SECRET;
  } else {
    process.env.REGULARIZE_REPORTING_GRANT_SECRET = originalGrantSecret;
  }
  if (originalRegularizeInternalToken === undefined) {
    delete process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN;
  } else {
    process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN = originalRegularizeInternalToken;
  }
});

describe("regularize-service reporting secrets", () => {
  it("não usa segredo conhecido quando a variável não está definida", () => {
    process.env.NODE_ENV = "test";
    delete process.env.REGULARIZE_REPORTING_GRANT_SECRET;

    expect(getRegularizeServiceEnv().regularizeReportingGrantSecret).toBe("");
  });

  it("rejeita produção sem o segredo do grant de relatórios", () => {
    process.env.NODE_ENV = "production";
    process.env.AUDIT_SERVICE_TOKEN = "a".repeat(32);
    process.env.INTERNAL_SERVICE_TOKEN = "b".repeat(32);
    process.env.REGULARIZE_REPORTING_TOKEN = "c".repeat(32);
    process.env.SERVICE_ALLOWED_ORIGINS = "https://reports.example";
    delete process.env.REGULARIZE_REPORTING_GRANT_SECRET;

    expect(() => getRegularizeServiceEnv()).toThrow("REGULARIZE_REPORTING_GRANT_SECRET");
  });

  it("rejeita o reuso do token de auditoria no contexto gateway em produção", () => {
    process.env.NODE_ENV = "production";
    process.env.AUDIT_SERVICE_TOKEN = "a".repeat(32);
    process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN = process.env.AUDIT_SERVICE_TOKEN;
    process.env.REGULARIZE_REPORTING_TOKEN = "b".repeat(32);
    process.env.REGULARIZE_REPORTING_GRANT_SECRET = "c".repeat(32);
    process.env.SERVICE_ALLOWED_ORIGINS = "https://regularize.example";

    expect(() => getRegularizeServiceEnv()).toThrow(
      "REGULARIZE_SERVICE_INTERNAL_TOKEN deve ser diferente de AUDIT_SERVICE_TOKEN em produção.",
    );
  });

  it("nao usa o token legado como fallback do gateway em produção", () => {
    process.env.NODE_ENV = "production";
    process.env.AUDIT_SERVICE_TOKEN = "a".repeat(32);
    delete process.env.REGULARIZE_SERVICE_INTERNAL_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = "b".repeat(32);
    process.env.REGULARIZE_REPORTING_TOKEN = "c".repeat(32);
    process.env.REGULARIZE_REPORTING_GRANT_SECRET = "d".repeat(32);
    process.env.SERVICE_ALLOWED_ORIGINS = "https://regularize.example";

    expect(() => getRegularizeServiceEnv()).toThrow(/REGULARIZE_SERVICE_INTERNAL_TOKEN/);
  });
});

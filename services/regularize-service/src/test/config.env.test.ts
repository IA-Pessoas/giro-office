import "./envBootstrap.js";

import { afterEach, describe, expect, it } from "vitest";

import { getRegularizeServiceEnv } from "../config/env.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalGrantSecret = process.env.REGULARIZE_REPORTING_GRANT_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalGrantSecret === undefined) {
    delete process.env.REGULARIZE_REPORTING_GRANT_SECRET;
  } else {
    process.env.REGULARIZE_REPORTING_GRANT_SECRET = originalGrantSecret;
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
});

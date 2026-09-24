import { describe, expect, it } from "vitest";

import { parseReportsServiceEnv } from "../config/env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://127.0.0.1:1/reports_test",
  JWT_SECRET: "reports-test-secret",
  NODE_ENV: "test",
};

describe("reports-service env", () => {
  it("aceita timeout de fonte dentro da faixa segura", () => {
    const env = parseReportsServiceEnv({ ...baseEnv, REPORTS_SOURCE_TIMEOUT_MS: "2500" });

    expect(env.sourceTimeoutMs).toBe(2500);
  });

  it.each([
    "0",
    "99",
    "60001",
    "not-a-number",
  ])("recusa timeout de fonte fora da faixa: %s", (timeout) => {
    expect(() =>
      parseReportsServiceEnv({ ...baseEnv, REPORTS_SOURCE_TIMEOUT_MS: timeout }),
    ).toThrow();
  });
});

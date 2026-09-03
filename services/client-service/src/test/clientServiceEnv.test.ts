import { describe, expect, it } from "vitest";

import { parseClientServiceEnv } from "../config/env.js";

describe("client-service env", () => {
  it("exige segredo HMAC de relatórios em produção", () => {
    expect(() =>
      parseClientServiceEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        JWT_SECRET: "test-jwt-secret",
        CLIENT_HISTORY_STORAGE_MODE: "local",
        CLIENT_SERVICE_INTERNAL_TOKEN: "a".repeat(32),
        REPORTS_INTERNAL_TOKEN: "b".repeat(32),
        SERVICE_ALLOWED_ORIGINS: "https://app.example.com",
      }),
    ).toThrow(/REPORTS_GRANT_SECRET/);
  });
});

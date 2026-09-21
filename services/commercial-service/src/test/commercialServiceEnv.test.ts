import "./envBootstrap.js";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getCommercialServiceEnv } from "../config/env.js";

const productionServiceToken = "unit-test-internal-token-with-at-least-32-chars";

function stubValidProductionEnvironment(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/giro_test");
  vi.stubEnv("JWT_SECRET", "unit-test-jwt-secret");
  vi.stubEnv("AUDIT_SERVICE_TOKEN", productionServiceToken);
  vi.stubEnv("CLIENT_SERVICE_INTERNAL_TOKEN", productionServiceToken);
  vi.stubEnv("TASK_SERVICE_INTERNAL_TOKEN", productionServiceToken);
  vi.stubEnv("SERVICE_ALLOWED_ORIGINS", "https://commercial.example.test");
  vi.stubEnv("COMMERCIAL_EMAIL_ADAPTER_URL", "https://n8n.example.test/webhook/email-office");
  vi.stubEnv("COMMERCIAL_EMAIL_ADAPTER_TOKEN", "unit-test-adapter-token");
}

describe("commercial-service environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires an explicit sender address when the production email adapter is configured", () => {
    stubValidProductionEnvironment();
    vi.stubEnv("COMMERCIAL_EMAIL_FROM", undefined);

    expect(() => getCommercialServiceEnv()).toThrow(/COMMERCIAL_EMAIL_FROM/u);
  });

  it("uses the explicitly configured sender address in production", () => {
    stubValidProductionEnvironment();
    vi.stubEnv("COMMERCIAL_EMAIL_FROM", "comercial@example.test");

    expect(getCommercialServiceEnv().emailFrom).toBe("comercial@example.test");
  });
});

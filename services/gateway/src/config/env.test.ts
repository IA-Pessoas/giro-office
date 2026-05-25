import { afterEach, describe, expect, it } from "vitest";

import { getGatewayEnv } from "./env.js";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
}

function setGatewayEnv(overrides: NodeJS.ProcessEnv) {
  restoreEnv();
  process.env.JWT_SECRET = "test-secret";
  process.env.NODE_ENV = "production";
  process.env.AUDIT_SERVICE_TOKEN = "secure-internal-token-with-at-least-32-chars";
  process.env.TI_SERVICE_INTERNAL_TOKEN = "secure-ti-service-token-with-at-least-32-chars";
  process.env.GATEWAY_ALLOWED_ORIGINS = "https://app.example.com";
  Object.assign(process.env, overrides);
}

describe("gateway env security validation", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("rejects the default internal service token in production", () => {
    setGatewayEnv({ AUDIT_SERVICE_TOKEN: "audit-service-token" });

    expect(() => getGatewayEnv()).toThrow(/AUDIT_SERVICE_TOKEN/);
  });

  it("rejects the default ti-service internal token in production", () => {
    setGatewayEnv({ TI_SERVICE_INTERNAL_TOKEN: "ti-service-token" });

    expect(() => getGatewayEnv()).toThrow(/TI_SERVICE_INTERNAL_TOKEN/);
  });

  it("rejects wildcard authenticated CORS origins in production", () => {
    setGatewayEnv({ GATEWAY_ALLOWED_ORIGINS: "*" });

    expect(() => getGatewayEnv()).toThrow(/GATEWAY_ALLOWED_ORIGINS/);
  });

  it("uses safe defaults for optional gateway public URL and JSON body limit", () => {
    setGatewayEnv({});

    const env = getGatewayEnv();

    expect(env.publicGatewayUrl).toBeUndefined();
    expect(env.jsonBodyLimit).toBe("1mb");
  });

  it("parses optional gateway public URL and JSON body limit overrides", () => {
    setGatewayEnv({
      GATEWAY_PUBLIC_URL: "https://api.example.com",
      GATEWAY_JSON_BODY_LIMIT: "512kb",
    });

    const env = getGatewayEnv();

    expect(env.publicGatewayUrl).toBe("https://api.example.com");
    expect(env.jsonBodyLimit).toBe("512kb");
  });

  it("rejects invalid gateway JSON body limit values", () => {
    setGatewayEnv({ GATEWAY_JSON_BODY_LIMIT: "abc" });

    expect(() => getGatewayEnv()).toThrow(/GATEWAY_JSON_BODY_LIMIT/);
  });
});

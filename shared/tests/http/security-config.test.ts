import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAllowedOrigins,
  validateProductionCorsOrigins,
  validateProductionInternalServiceToken,
} from "../../src/http/security-config.js";

test("parseAllowedOrigins parses comma-separated allowed origins", () => {
  assert.deepEqual(parseAllowedOrigins("https://app.example.com, https://admin.example.com"), [
    "https://app.example.com",
    "https://admin.example.com",
  ]);
});

test("validateProductionInternalServiceToken rejects default tokens in production", () => {
  assert.throws(
    () =>
      validateProductionInternalServiceToken({
        nodeEnv: "production",
        serviceName: "test-service",
        envName: "AUDIT_SERVICE_TOKEN",
        token: "audit-service-token",
      }),
    /AUDIT_SERVICE_TOKEN/,
  );
});

test("validateProductionCorsOrigins rejects wildcard origins in production", () => {
  assert.throws(
    () =>
      validateProductionCorsOrigins({
        nodeEnv: "production",
        serviceName: "test-service",
        envName: "SERVICE_ALLOWED_ORIGINS",
        allowedOrigins: ["*"],
      }),
    /SERVICE_ALLOWED_ORIGINS/,
  );
});

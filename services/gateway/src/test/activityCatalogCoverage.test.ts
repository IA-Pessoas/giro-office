import { expect, it } from "vitest";

import { classifyActivity } from "../audit/activityCatalog.js";
import type { GatewayEnv } from "../config/env.js";
import { buildGatewayOpenApiSpec } from "../openapi/gatewaySpec.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

function createCoverageEnv(): GatewayEnv {
  return {
    nodeEnv: "test",
    enableApiDocs: true,
    authorizationMode: "enforce",
    bearerAuthCompatibility: true,
    authCookieSecure: false,
    auditEnabled: false,
    auditServiceToken: "audit-service-token",
    auditServiceUrl: "http://127.0.0.1:3020",
    port: 0,
    organizationServiceUrl: "http://127.0.0.1:3031",
    rhServiceUrl: "http://127.0.0.1:3034",
    userServiceUrl: "http://127.0.0.1:3030",
    taskServiceUrl: "http://127.0.0.1:3032",
    projectServiceUrl: "http://127.0.0.1:3033",
    clientServiceUrl: "http://127.0.0.1:3035",
    clientServiceInternalToken: "client-service-token",
    departmentServiceUrl: "http://127.0.0.1:3336",
    commercialServiceUrl: "http://127.0.0.1:3045",
    fiscalServiceUrl: "http://127.0.0.1:3037",
    contabilServiceUrl: "http://127.0.0.1:3038",
    regularizeServiceUrl: "http://127.0.0.1:3039",
    tiServiceUrl: "http://127.0.0.1:3040",
    tiServiceInternalToken: "ti-service-token",
    certificateServiceUrl: "http://127.0.0.1:3041",
    certificateServiceInternalToken: "certificate-service-token",
    pessoalServiceUrl: "http://127.0.0.1:3042",
    parcelamentoServiceUrl: "http://127.0.0.1:3043",
    reportsServiceUrl: "http://127.0.0.1:3044",
    databaseUrl: "postgres://test:test@127.0.0.1:5432/gateway_test",
    jwtSecret: "test-secret",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    rateLimitMax: 300,
    rateLimitWindowMs: 60_000,
    authRateLimitMax: 10,
    authRateLimitWindowMs: 60_000,
    jsonBodyLimit: "1mb",
  };
}

function materializePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "9a68a809-9a78-4ef9-94d0-b9bb9787ad2e");
}

it("classifica toda operação pública do gateway", () => {
  const spec = buildGatewayOpenApiSpec(createCoverageEnv());
  const unknown: string[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (!(pathItem as Record<string, unknown> | undefined)?.[method]) continue;

      if (classifyActivity(method, materializePath(path)).kind === "unknown") {
        unknown.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  expect(unknown).toEqual([]);
});

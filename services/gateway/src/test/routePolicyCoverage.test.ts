import { describe, expect, it } from "vitest";

import type { GatewayEnv } from "../config/env.js";
import { buildGatewayOpenApiSpec } from "../openapi/gatewaySpec.js";
import { getRoutePolicy } from "../security/policies.js";
import { isPublicRoute } from "../security/publicRoutes.js";
import { getUnclassifiedGatewayOperations } from "../security/routePolicyCoverage.js";

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
    fiscalServiceUrl: "http://127.0.0.1:3037",
    contabilServiceUrl: "http://127.0.0.1:3038",
    triagemServiceUrl: "http://127.0.0.1:3046",
    regularizeServiceUrl: "http://127.0.0.1:3039",
    tiServiceUrl: "http://127.0.0.1:3040",
    tiServiceInternalToken: "ti-service-token",
    certificateServiceUrl: "http://127.0.0.1:3041",
    certificateServiceInternalToken: "certificate-service-token",
    pessoalServiceUrl: "http://127.0.0.1:3042",
    parcelamentoServiceUrl: "http://127.0.0.1:3043",
    reportsServiceUrl: "http://127.0.0.1:3044",
    commercialServiceUrl: "http://127.0.0.1:3045",
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

it("classifies every documented gateway operation as public or policy-protected", () => {
  expect(getUnclassifiedGatewayOperations(createCoverageEnv())).toEqual([]);
});

describe("platform default deny", () => {
  it("deixa público somente o login e exige platformOnly nas demais rotas", () => {
    expect(isPublicRoute("POST", "/platform/session")).toBe(true);
    expect(isPublicRoute("POST", "/platform/session/refresh")).toBe(false);
    expect(isPublicRoute("DELETE", "/platform/session")).toBe(false);

    for (const [method, path] of [
      ["POST", "/platform/session/refresh"],
      ["DELETE", "/platform/session"],
      ["GET", "/platform/me"],
      ["GET", "/platform/super-admins"],
      ["GET", "/platform/organizations"],
      ["POST", "/platform/organizations"],
      ["GET", "/platform/organizations/org-1"],
      ["PATCH", "/platform/organizations/org-1/status"],
      ["PATCH", "/platform/organizations/org-1/subscription-plan"],
      ["PATCH", "/platform/organizations/org-1/logo-url"],
      ["GET", "/platform/organizations/org-1/users"],
      ["POST", "/platform/organizations/org-1/users"],
      ["GET", "/platform/organizations/org-1/users/user-1"],
      ["POST", "/platform/organizations/org-1/users/user-1/impersonate"],
      ["DELETE", "/platform/organizations/org-1/users/user-1"],
      ["POST", "/platform/organizations/org-1/users/user-1/reactivate"],
      ["PATCH", "/platform/organizations/org-1/users/user-1"],
      ["GET", "/platform/organizations/org-1/departments"],
      ["GET", "/platform/audit/requests"],
    ]) {
      expect(getRoutePolicy(method, path), `${method} ${path}`).toEqual({
        special: "platformOnly",
      });
    }

    for (const [method, path] of [
      ["DELETE", "/platform/organizations"],
      ["PATCH", "/platform/organizations/org-1"],
      ["GET", "/platform/organizations/org-1/status"],
      ["PATCH", "/platform/organizations/org-1/status/extra"],
      ["POST", "/platform/organizations/org-1/departments"],
    ]) {
      expect(getRoutePolicy(method, path), `${method} ${path}`).toBeNull();
    }
  });

  it("não publica o endpoint interno de validação da sessão", () => {
    const spec = buildGatewayOpenApiSpec(createCoverageEnv());

    expect(spec.paths["/platform/session/validate"]).toBeUndefined();
    expect(getRoutePolicy("POST", "/platform/session/validate")).toBeNull();
    expect(isPublicRoute("POST", "/platform/session/validate")).toBe(false);
  });
});

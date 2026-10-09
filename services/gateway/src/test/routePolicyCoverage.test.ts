import type { AuthContext } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";

import type { GatewayEnv } from "../config/env.js";
import { buildAuthorizeMiddleware } from "../middlewares/authorize.js";
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
    marketingServiceUrl: "http://127.0.0.1:3047",
    marketingServiceInternalToken: "marketing-service-token",
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

function authorizeClientRequest(
  method: string,
  originalUrl: string,
  modules: Record<string, number>,
  body: unknown = {},
): unknown {
  let error: unknown;
  const request = {
    method,
    originalUrl,
    body,
    auth: {
      token: "test-token",
      userId: "user-1",
      organizationId: "org-1",
      actorKind: "organization",
      isPlatformAdmin: false,
      claims: { user_id: "user-1", organization_id: "org-1", type: "user", modules },
    } as AuthContext,
  } as Request;
  buildAuthorizeMiddleware("enforce")(
    request,
    {} as Response,
    ((reason?: unknown) => {
      error = reason;
    }) as NextFunction,
  );
  return error;
}

it("classifies every documented gateway operation as public or policy-protected", () => {
  expect(getUnclassifiedGatewayOperations(createCoverageEnv())).toEqual([]);
});

describe("Marketing access to canonical Instagram profiles", () => {
  it("allows Marketing viewers to query only the scoped profile report", () => {
    expect(
      authorizeClientRequest("GET", "/client/instagram-profiles/report", { marketing: 1 }),
    ).toBeUndefined();
    expect(authorizeClientRequest("GET", "/client/client-1", { marketing: 1 })).toMatchObject({
      statusCode: 403,
    });
    expect(authorizeClientRequest("GET", "/client/list", { marketing: 1 })).toMatchObject({
      statusCode: 403,
    });
  });

  it("allows Marketing editors to change only Instagram while Integration editors keep existing access", () => {
    expect(
      authorizeClientRequest(
        "PATCH",
        "/client/client-1/integration",
        { marketing: 2 },
        {
          instagram: "@acme",
        },
      ),
    ).toBeUndefined();
    expect(
      authorizeClientRequest(
        "PATCH",
        "/client/client-1/integration",
        { marketing: 2 },
        {
          instagram: "@acme",
          email: "contact@acme.com",
        },
      ),
    ).toMatchObject({ statusCode: 403 });
    expect(
      authorizeClientRequest(
        "PATCH",
        "/client/client-1/integration",
        { integracao: 2 },
        {
          instagram: "@acme",
          email: "contact@acme.com",
        },
      ),
    ).toBeUndefined();
    expect(
      authorizeClientRequest(
        "PATCH",
        "/client/client-1/integration",
        { marketing: 1 },
        {
          instagram: "@acme",
        },
      ),
    ).toMatchObject({ statusCode: 403 });
  });
});

describe("Marketing access to organization user profiles", () => {
  it("allows Marketing viewer to read only the user list and profile photo", () => {
    expect(authorizeClientRequest("GET", "/user", { marketing: 1 })).toBeUndefined();
    expect(authorizeClientRequest("GET", "/user/user-1/photo", { marketing: 1 })).toBeUndefined();
    expect(authorizeClientRequest("GET", "/user/user-1", { marketing: 1 })).toMatchObject({
      statusCode: 403,
    });
  });

  it("allows Marketing editor to mutate only a user photo", () => {
    expect(authorizeClientRequest("POST", "/user/user-1/photo", { marketing: 2 })).toBeUndefined();
    expect(
      authorizeClientRequest("DELETE", "/user/user-1/photo", { marketing: 2 }),
    ).toBeUndefined();
    expect(
      authorizeClientRequest("PUT", "/user/user-2", { marketing: 2 }, { name: "New name" }),
    ).toMatchObject({
      statusCode: 403,
    });
    expect(
      authorizeClientRequest("PUT", "/user/user-1", { marketing: 2 }, { name: "New name" }),
    ).toMatchObject({ statusCode: 403 });
    expect(
      authorizeClientRequest("PUT", "/user/user-1", { marketing: 2 }, { password: "secret" }),
    ).toBeUndefined();
    expect(authorizeClientRequest("DELETE", "/user/user-1/photo", { marketing: 1 })).toMatchObject({
      statusCode: 403,
    });
  });
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
      ["PATCH", "/platform/super-admins/platform-user-2/impersonation-permission"],
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

    expect(getRoutePolicy("POST", "/platform/impersonation/exit")).toEqual({
      special: "impersonationOnly",
    });

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

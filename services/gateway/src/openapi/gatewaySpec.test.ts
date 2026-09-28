import { expect, it } from "vitest";

import type { GatewayEnv } from "../config/env.js";
import { buildGatewayOpenApiSpec } from "./gatewaySpec.js";

it("agrega o catálogo público do reports-service", () => {
  const spec = buildGatewayOpenApiSpec({
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
  } satisfies GatewayEnv);

  expect(spec.paths["/reports/catalog"]?.get?.["x-origin-service"]).toBe("reports-service");
  expect(spec.paths["/commercial/proposal-configs"]?.get?.["x-origin-service"]).toBe(
    "commercial-service",
  );
  expect(spec.paths["/commercial/prospecting"]?.post?.["x-origin-service"]).toBe(
    "commercial-service",
  );
  expect(spec.paths["/marketing/dashboard"]).toBeDefined();
  expect(spec.paths["/marketing/events/list"]).toBeDefined();
  expect(spec.paths["/marketing/events"]?.post?.["x-origin-service"]).toBe("marketing-service");
  expect(spec.paths["/triagem/catalogs"]?.get?.["x-origin-service"]).toBe("triagem-service");
  expect(spec.paths["/triagem/external-links"]?.post?.["x-origin-service"]).toBe("triagem-service");
  expect(spec.paths["/triagem/overview"]?.get?.["x-origin-service"]).toBe("triagem-service");
  expect(spec.paths["/internal/reporting/access-context"]).toBeUndefined();
  expect(
    spec.paths["/platform/organizations/{organizationId}/users/{userId}/permissions"]?.get
      ?.security,
  ).toEqual([{ cookieAuth: [] }]);
  const permissionUpdate =
    spec.paths["/platform/organizations/{organizationId}/users/{userId}/permissions"]?.put;
  expect(permissionUpdate?.security).toEqual([{ cookieAuth: [] }]);
  expect(permissionUpdate?.parameters).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "x-csrf-token", required: true })]),
  );
  expect(permissionUpdate?.responses).toHaveProperty("422");

  expect(spec.paths["/platform/impersonation/exit"]?.post?.security).toEqual([
    { cookieAuth: [] },
    { bearerAuth: [] },
  ]);

  for (const [path, method] of [
    ["/platform/organizations", "get"],
    ["/platform/organizations", "post"],
    ["/platform/organizations/{id}", "get"],
    ["/platform/organizations/{id}/status", "patch"],
    ["/platform/organizations/{id}/subscription-plan", "patch"],
    ["/platform/organizations/{id}/logo-url", "patch"],
  ] as const) {
    const operation = spec.paths[path]?.[method];
    expect(operation?.security, `${method.toUpperCase()} ${path}`).toEqual([{ cookieAuth: [] }]);
    expect(operation?.["x-origin-service"]).toBe("organization-service");
    if (method === "post" || method === "patch") {
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "x-csrf-token", required: true })]),
      );
      expect(operation?.requestBody?.content?.["application/json"]?.schema).toMatchObject({
        additionalProperties: false,
      });
    }
  }

  expect(spec.paths["/platform/audit/requests"]?.get?.parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "organizationId",
        schema: expect.objectContaining({ format: "uuid" }),
      }),
    ]),
  );
  expect(spec.paths["/internal/reporting/catalog"]).toBeUndefined();
  expect(spec.paths["/internal/reporting/extract"]).toBeUndefined();
});

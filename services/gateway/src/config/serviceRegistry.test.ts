import { describe, expect, it } from "vitest";

import type { GatewayEnv } from "./env.js";
import { getGatewayServiceDefinitions, resolveGatewayService } from "./serviceRegistry.js";

describe("reports-service gateway registry", () => {
  it("resolves the public reports prefix without a gateway permission module", () => {
    const env = { reportsServiceUrl: "http://reports-service:3044" } as GatewayEnv;

    const reportsService = resolveGatewayService(env, "/reports/catalog");

    expect(reportsService).toMatchObject({
      key: "reports-service",
      targetUrl: "http://reports-service:3044",
      auditTarget: "reports-service",
      routePrefixes: ["/reports"],
    });
    expect(reportsService?.permissionModule).toBeUndefined();
    expect(getGatewayServiceDefinitions(env)).toContainEqual(reportsService);
  });
});

describe("user-service gateway registry", () => {
  it("forwards the trusted gateway token with authenticated identity", () => {
    const env = {
      userServiceUrl: "http://user-service:3030",
      userServiceInternalToken: "gateway-user-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/user/me")).toMatchObject({
      key: "user-service",
      internalServiceToken: "gateway-user-token",
      forwardSessionBinding: true,
    });
    expect(
      getGatewayServiceDefinitions(env).filter((service) => service.forwardSessionBinding),
    ).toHaveLength(1);
  });

  it("normaliza trailing slash e rejeita dot-segment antes de resolver o upstream", () => {
    const env = {
      userServiceUrl: "http://user-service:3030",
      userServiceInternalToken: "gateway-user-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/platform/me/", "GET")?.key).toBe("user-service");
    expect(resolveGatewayService(env, "/platform/../user/me", "GET")).toBeNull();
  });

  it.each([
    ["GET", "/platform/organizations/org-1/users/user-1"],
    ["GET", "/platform/organizations/org-1/departments"],
    ["DELETE", "/platform/organizations/org-1/users/user-1"],
    ["POST", "/platform/organizations/org-1/users/user-1/reactivate"],
    ["POST", "/platform/organizations/org-1/ownership-transfer"],
  ])("encaminha %s %s exclusivamente ao user-service com sessão de plataforma", (method, path) => {
    const env = {
      userServiceUrl: "http://user-service:3030",
      userServiceInternalToken: "gateway-user-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, path, method)).toMatchObject({
      key: "user-service",
      targetUrl: "http://user-service:3030",
      internalServiceToken: "gateway-user-token",
      forwardPlatformSessionCredentials: true,
    });
  });

  it("encaminha a criação de usuário da organização ao user-service", () => {
    const env = {
      userServiceUrl: "http://user-service:3030",
      userServiceInternalToken: "gateway-user-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/platform/organizations/org-1/users", "POST")).toMatchObject(
      {
        key: "user-service",
        targetUrl: "http://user-service:3030",
        internalServiceToken: "gateway-user-token",
        forwardPlatformSessionCredentials: true,
      },
    );
  });

  it("não libera DELETE de departamento pela allowlist de lifecycle de usuário", () => {
    const env = {
      userServiceUrl: "http://user-service:3030",
      userServiceInternalToken: "gateway-user-token",
    } as GatewayEnv;

    expect(
      resolveGatewayService(env, "/platform/organizations/org-1/departments", "DELETE"),
    ).toBeNull();
  });
});

describe("organization-service platform registry", () => {
  const env = {
    organizationServiceUrl: "http://organization-service:3031",
    auditServiceToken: "gateway-organization-token",
  } as GatewayEnv;

  it.each([
    ["GET", "/platform/organizations"],
    ["POST", "/platform/organizations"],
    ["GET", "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e"],
    ["PATCH", "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/status"],
    ["PATCH", "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/subscription-plan"],
    ["PATCH", "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/logo-url"],
  ])("resolve %s %s exclusivamente para o organization-service", (method, path) => {
    expect(resolveGatewayService(env, `${path}/`, method)).toMatchObject({
      key: "organization-service",
      targetUrl: "http://organization-service:3031",
      internalServiceToken: "gateway-organization-token",
      forwardPlatformSessionCredentials: true,
    });
  });

  it.each([
    ["DELETE", "/platform/organizations"],
    ["PUT", "/platform/organizations/id/status"],
    ["GET", "/platform/organizations/id/status"],
    ["PATCH", "/platform/organizations/id"],
    ["PATCH", "/platform/organizations/id/status/extra"],
    ["GET", "/platform/organizations/id/extra"],
    ["GET", "/platform/organizations/id%2fstatus"],
    ["GET", "/platform/organizations/../organizations"],
  ])("mantém default-deny para %s %s", (method, path) => {
    expect(resolveGatewayService(env, path, method)).toBeNull();
  });
});

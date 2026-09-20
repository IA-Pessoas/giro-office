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

describe("commercial-service gateway registry", () => {
  it("encaminha o catálogo comercial com sessão de usuário e permissão Comercial", () => {
    const env = {
      commercialServiceUrl: "http://commercial-service:3045",
      auditServiceToken: "gateway-commercial-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/commercial/proposal-configs", "GET")).toMatchObject({
      key: "commercial-service",
      targetUrl: "http://commercial-service:3045",
      internalServiceToken: "gateway-commercial-token",
      permissionModule: "comercial",
      routePrefixes: ["/commercial"],
    });
  });
});

describe("regularize-service gateway registry", () => {
  it("encaminha contexto confiável e a permissão específica do módulo", () => {
    const env = {
      regularizeServiceUrl: "http://regularize-service:3039",
      auditServiceToken: "gateway-audit-token",
      regularizeServiceInternalToken: "gateway-regularize-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/regularize/processes", "GET")).toMatchObject({
      key: "regularize-service",
      targetUrl: "http://regularize-service:3039",
      internalServiceToken: "gateway-regularize-token",
      permissionModule: "regularize",
      routePrefixes: ["/regularize"],
    });
  });
});

describe("triagem gateway registry", () => {
  it("encaminha triagem ao serviço novo sem reduzir a autorização ao módulo Contábil", () => {
    const env = {
      contabilServiceUrl: "http://contabil-service:3038",
      triagemServiceUrl: "http://triagem-service:3046",
      auditServiceToken: "gateway-triagem-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/triagem/competencies", "POST")).toMatchObject({
      key: "triagem-service",
      targetUrl: "http://triagem-service:3046",
      internalServiceToken: "gateway-triagem-token",
      permissionModule: "triagem",
      routePrefixes: [
        "/triagem/overview",
        "/triagem/competencies",
        "/triagem/catalogs",
        "/triagem/external-links",
        "/triagem/urgent-requests",
      ],
    });
    expect(resolveGatewayService(env, "/triagem/external-links", "POST")).toMatchObject({
      key: "triagem-service",
      targetUrl: "http://triagem-service:3046",
      internalServiceToken: "gateway-triagem-token",
      permissionModule: "triagem",
      routePrefixes: [
        "/triagem/overview",
        "/triagem/competencies",
        "/triagem/catalogs",
        "/triagem/external-links",
        "/triagem/urgent-requests",
      ],
    });
    expect(resolveGatewayService(env, "/triagem/overview", "GET")).toMatchObject({
      key: "triagem-service",
      targetUrl: "http://triagem-service:3046",
      permissionModule: "triagem",
    });
    expect(resolveGatewayService(env, "/triagem/urgent-requests", "GET")).toMatchObject({
      key: "triagem-service",
      targetUrl: "http://triagem-service:3046",
      permissionModule: "triagem",
    });
    expect(
      resolveGatewayService(env, "/triagem/urgent-requests/request-1/close", "PATCH"),
    ).toMatchObject({
      key: "triagem-service",
      targetUrl: "http://triagem-service:3046",
      permissionModule: "triagem",
    });
    expect(resolveGatewayService(env, "/triagem/closing", "PUT")).toMatchObject({
      key: "triagem-legacy-service",
      targetUrl: "http://contabil-service:3038",
      internalServiceToken: "gateway-triagem-token",
      routePrefixes: ["/triagem"],
    });
    expect(resolveGatewayService(env, "/triagem/closing", "PUT")?.permissionModule).toBeUndefined();
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
    ["GET", "/platform/organizations/org-1/users/user-1/permissions"],
    ["PUT", "/platform/organizations/org-1/users/user-1/permissions"],
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

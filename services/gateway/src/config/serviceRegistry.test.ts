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
      auditServiceToken: "gateway-user-token",
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
      auditServiceToken: "gateway-user-token",
    } as GatewayEnv;

    expect(resolveGatewayService(env, "/platform/me/", "GET")?.key).toBe("user-service");
    expect(resolveGatewayService(env, "/platform/../user/me", "GET")).toBeNull();
  });
});

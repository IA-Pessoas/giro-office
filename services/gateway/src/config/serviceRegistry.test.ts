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

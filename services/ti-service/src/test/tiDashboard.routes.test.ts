import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti dashboard routes", () => {
  it("GET /ti/dashboard returns dashboard summary with permission 2", async () => {
    const response = await request(createTestApp()).get("/ti/dashboard").set(gatewayHeaders(2));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        scope: "organization",
        openRequests: 2,
        criticalRequests: 1,
        resolvedLastSevenDays: 1,
        closedRequests: 2,
        inventoryAssets: 5,
        assignedInventoryAssets: 3,
        pendingTerms: 1,
        lowStockItems: 0,
        activeRobots: 0,
      },
    });
  });

  it("GET /ti/dashboard allows Viewer and returns a self-scoped summary", async () => {
    const response = await request(createTestApp()).get("/ti/dashboard").set(gatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        scope: "self",
        openRequests: 2,
        criticalRequests: 1,
        resolvedLastSevenDays: 1,
        closedRequests: 2,
      },
    });
    expect(response.body.data).not.toHaveProperty("inventoryAssets");
    expect(response.body.data).not.toHaveProperty("assignedInventoryAssets");
    expect(response.body.data).not.toHaveProperty("pendingTerms");
    expect(response.body.data).not.toHaveProperty("lowStockItems");
    expect(response.body.data).not.toHaveProperty("activeRobots");
  });

  it("GET /ti/dashboard requires Viewer permission", async () => {
    const response = await request(createTestApp()).get("/ti/dashboard").set(gatewayHeaders(0));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });
});

import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const targetUserId = "00000000-0000-4000-8000-000000000002";

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function appWithRows(results: unknown[][]) {
  const prisma = createPrismaMock();
  const $queryRaw = vi.fn(async (..._args: unknown[]) => results.shift() ?? []);
  Object.assign(prisma, { $queryRaw });
  return { app: createTestApp(prisma), $queryRaw };
}

describe("ti access log routes", () => {
  it("GET /ti/access-logs/:userId is restricted to TI admins", async () => {
    const { app, $queryRaw } = appWithRows([]);

    for (const permission of [1, 2]) {
      const response = await request(app)
        .get(`/ti/access-logs/${targetUserId}`)
        .set(gatewayHeaders(permission));
      expect(response.status).toBe(403);
    }
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("GET /ti/access-logs/:userId validates the user id and the pagination", async () => {
    const { app, $queryRaw } = appWithRows([]);

    const invalidUser = await request(app).get("/ti/access-logs/nao-e-uuid").set(gatewayHeaders(3));
    const invalidPage = await request(app)
      .get(`/ti/access-logs/${targetUserId}?page_size=101`)
      .set(gatewayHeaders(3));

    expect(invalidUser.status).toBe(400);
    expect(invalidPage.status).toBe(400);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("GET /ti/access-logs/:userId lists the accesses scoped by the caller organization", async () => {
    const user = { id: targetUserId, name: "Ana", full_name: null };
    const { app, $queryRaw } = appWithRows([
      [user],
      [
        {
          id: "l1",
          type: "0",
          referring: "Login Tecnologia",
          referring_id: "0",
          date: new Date("2025-01-02T12:00:00.000Z"),
        },
      ],
    ]);

    const response = await request(app)
      .get(`/ti/access-logs/${targetUserId}?page=1&page_size=20`)
      .set(gatewayHeaders(3));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user,
        has_more: false,
        items: [
          {
            id: "l1",
            type: "login",
            referring: "Login Tecnologia",
            date: "2025-01-02T12:00:00.000Z",
            origin: null,
          },
        ],
      },
    });
    expect($queryRaw.mock.calls[0]?.slice(1)).toEqual([targetUserId, organizationId]);
  });

  it("GET /ti/access-logs/:userId answers 404 for a user outside the organization", async () => {
    const { app } = appWithRows([[]]);

    const response = await request(app)
      .get(`/ti/access-logs/${targetUserId}`)
      .set(gatewayHeaders(3));

    expect(response.status).toBe(404);
  });
});

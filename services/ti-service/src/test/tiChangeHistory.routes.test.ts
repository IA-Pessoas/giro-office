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
const passwordId = "40000000-0000-4000-8000-000000000001";

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function appWithHistory(rows: unknown[]) {
  const prisma = createPrismaMock();
  const findMany = vi.fn(async (..._args: unknown[]) => rows);
  Object.assign(prisma, {
    changeHistoryTecnologia: { findMany },
    user: { findMany: vi.fn(async () => [{ id: userId, name: "Ana", full_name: null }]) },
  });
  return { app: createTestApp(prisma), findMany };
}

describe("ti change history routes", () => {
  it("GET /ti/change-history/list is restricted to TI admins", async () => {
    const { app, findMany } = appWithHistory([]);

    for (const permission of [1, 2]) {
      const response = await request(app)
        .get("/ti/change-history/list")
        .set(gatewayHeaders(permission));
      expect(response.status).toBe(403);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("GET /ti/change-history/list validates the filters", async () => {
    const { app, findMany } = appWithHistory([]);

    // Estoque e acesso têm histórico próprio e não são tipos deste.
    for (const query of ["item_type=stock", "item_type=access", "item_id=nao-e-uuid", "page=0"]) {
      const response = await request(app)
        .get(`/ti/change-history/list?${query}`)
        .set(gatewayHeaders(3));
      expect(response.status).toBe(400);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("GET /ti/change-history/list scopes by organization and masks credential values", async () => {
    const { app, findMany } = appWithHistory([
      {
        id: "h1",
        item_type: "password",
        item_id: passwordId,
        field: "senha",
        before: "antiga-123",
        after: "nova-456",
        note: "Atualização de senha",
        actor_user_id: userId,
        created_at: new Date("2026-10-13T12:00:00.000Z"),
        organization_id: organizationId,
      },
    ]);

    const response = await request(app)
      .get(`/ti/change-history/list?item_type=password&item_id=${passwordId}&page_size=10`)
      .set(gatewayHeaders(3));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      hasMore: false,
      items: [
        {
          id: "h1",
          item_type: "password",
          field: "senha",
          before: null,
          after: null,
          masked: true,
          note: "Atualização de senha",
          created_at: "2026-10-13T12:00:00.000Z",
        },
      ],
    });
    expect(response.text).not.toMatch(/antiga-123|nova-456/);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, item_type: "password", item_id: passwordId },
        take: 11,
      }),
    );
  });
});

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
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 2;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function createExtensionPrismaMock() {
  return {
    ...createPrismaMock(),
    extensionsTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => {
        if (where.number) {
          return null;
        }

        return {
          id: where.id,
          user_id: userId,
          number: "1234",
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "extension-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
}

describe("ti extension routes", () => {
  it("GET /ti/extensions/list requires admin permission", async () => {
    const response = await request(createTestApp(createExtensionPrismaMock() as never))
      .get("/ti/extensions/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/extensions/list lists extensions with admin permission", async () => {
    const response = await request(createTestApp(createExtensionPrismaMock() as never))
      .get("/ti/extensions/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
  });

  it("POST /ti/extensions creates an extension", async () => {
    const response = await request(createTestApp(createExtensionPrismaMock() as never))
      .post("/ti/extensions")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        user_id: userId,
        number: "1234",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user_id: userId,
        number: "1234",
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/extensions requires admin permission", async () => {
    const response = await request(createTestApp(createExtensionPrismaMock() as never))
      .post("/ti/extensions")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({
        user_id: userId,
        number: "1234",
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });
});

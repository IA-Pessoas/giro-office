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
const categoryId = "20000000-0000-4000-8000-000000000001";
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

describe("ti inventory category routes", () => {
  it("GET /ti/inventory-categories/list lists categories", async () => {
    const response = await request(createTestApp())
      .get("/ti/inventory-categories/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: [] });
  });

  it("POST /ti/inventory-categories requires admin permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory-categories")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ name: "Notebook" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/inventory-categories validates body", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory-categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "name é obrigatório.",
      code: "BAD_REQUEST",
    });
  });

  it("PATCH /ti/inventory-categories/:id updates category", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/inventory-categories/${categoryId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: categoryId, active: false },
    });
  });
});

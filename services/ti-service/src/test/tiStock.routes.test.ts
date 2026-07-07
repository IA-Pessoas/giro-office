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
const categoryId = "60000000-0000-4000-8000-000000000001";
const locationId = "70000000-0000-4000-8000-000000000001";
const stockId = "80000000-0000-4000-8000-000000000001";
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

describe("ti stock routes", () => {
  it("GET /ti/stock/items/list lists stock items", async () => {
    const response = await request(createTestApp())
      .get("/ti/stock/items/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
  });

  it("POST /ti/stock/items creates a stock item with admin level 2", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/items")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        name: "Notebook",
        category_id: categoryId,
        location_id: locationId,
        quantity: 5,
        description: "Notebook Dell.",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Notebook",
        category_id: categoryId,
        location_id: locationId,
        quantity: 5,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/stock/items requires admin permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/items")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({
        name: "Notebook",
        category_id: categoryId,
        location_id: locationId,
        quantity: 5,
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/stock/items/:id/entries creates an entry", async () => {
    const response = await request(createTestApp())
      .post(`/ti/stock/items/${stockId}/entries`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ quantity: 4 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: stockId,
        quantity: 9,
      },
    });
  });

  it("PATCH /ti/stock/items/:id rejects direct quantity changes", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/stock/items/${stockId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ quantity: 10 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /ti/stock/items/:id/exits creates an exit", async () => {
    const response = await request(createTestApp())
      .post(`/ti/stock/items/${stockId}/exits`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        quantity: 2,
        requester_id: userId,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: stockId,
        quantity: 3,
      },
    });
  });

  it("POST /ti/stock/items/:id/exits returns 409 when balance is insufficient", async () => {
    const response = await request(createTestApp())
      .post(`/ti/stock/items/${stockId}/exits`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        quantity: 20,
        requester_id: userId,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "Saldo insuficiente no estoque de TI.",
      code: "CONFLICT",
    });
  });

  it("POST /ti/stock/categories creates a stock category", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Perifericos" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Perifericos",
        status: true,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/stock/locations creates a stock location", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/locations")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Almoxarifado TI", floor: 2 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Almoxarifado TI",
        floor: 2,
        status: true,
        organization_id: organizationId,
      },
    });
  });
});

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
const TI_VIEWER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 3;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti stock routes", () => {
  it.each([
    "/ti/stock/items/list",
    `/ti/stock/items/${stockId}`,
    `/ti/stock/items/${stockId}/movements/list`,
    "/ti/stock/categories/list",
    "/ti/stock/locations/list",
  ])("GET %s rejects viewer permission", async (path) => {
    const response = await request(createTestApp())
      .get(path)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/stock/items/list lists stock items with admin permission", async () => {
    const response = await request(createTestApp())
      .get("/ti/stock/items/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        data: [],
        total: 0,
        page: 1,
        limit: 50,
        hasMore: false,
      },
    });
  });

  it("POST /ti/stock/items creates a stock item with admin level 3", async () => {
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
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
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

  it("GET /ti/stock/items/:id/movements/list lists consolidated movements", async () => {
    const response = await request(createTestApp())
      .get(`/ti/stock/items/${stockId}/movements/list`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [
        {
          id: "exit-1",
          type: "exit",
          quantity: 1,
          created_at: "2026-07-13T13:00:00.000Z",
          item_id: stockId,
          requester_id: userId,
          requester_name: "Usuario TI",
          approver_id: null,
          approver_name: null,
          operator_id: null,
          operator_name: null,
          destination: "Smoke TI stock exit.",
          location_destination_id: null,
          location_destination_name: null,
          balance_before: null,
          balance_after: null,
        },
        {
          id: "entry-1",
          type: "entry",
          quantity: 2,
          created_at: "2026-07-13T12:00:00.000Z",
          item_id: stockId,
          requester_id: null,
          requester_name: null,
          approver_id: null,
          approver_name: null,
          operator_id: userId,
          operator_name: "Usuario TI",
          destination: null,
          location_destination_id: null,
          location_destination_name: null,
          balance_before: null,
          balance_after: null,
        },
      ],
    });
  });

  it("GET /ti/stock/items/:id/movements/list rejects invalid item id", async () => {
    const response = await request(createTestApp())
      .get("/ti/stock/items/not-a-uuid/movements/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
      error: "Item de estoque invalido.",
    });
  });

  it("POST /ti/stock/categories creates a stock category without an existing normalized name", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Redes" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Redes",
        status: true,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/stock/categories returns 409 for a normalized duplicate", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "  perifericos  " });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "CONFLICT",
      error: "Ja existe uma categoria de estoque de TI ativa com este nome.",
    });
  });

  it("PATCH /ti/stock/categories/:id returns 409 for a unique category collision", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/stock/categories/${categoryId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Categoria em conflito" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "CONFLICT",
      error: "Ja existe uma categoria de estoque de TI ativa com este nome.",
    });
  });

  it("PATCH /ti/stock/categories/:id returns 409 when reactivating a conflicting category", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/stock/categories/${categoryId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ status: true });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "CONFLICT",
      error: "Ja existe uma categoria de estoque de TI ativa com este nome.",
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

  it("POST /ti/stock/locations rejects a normalized duplicate", async () => {
    const response = await request(createTestApp())
      .post("/ti/stock/locations")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "  ALMOXARIFADO   SAO  " });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "Ja existe um local de estoque de TI ativo com este nome.",
      code: "CONFLICT",
    });
  });
});

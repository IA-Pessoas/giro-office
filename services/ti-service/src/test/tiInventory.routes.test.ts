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
const locationId = "30000000-0000-4000-8000-000000000001";
const assetId = "40000000-0000-4000-8000-000000000001";
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 3;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti inventory routes", () => {
  it("GET /ti/inventory/list requires admin permission", async () => {
    const response = await request(createTestApp())
      .get("/ti/inventory/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/inventory/list lists assets with admin permission", async () => {
    const response = await request(createTestApp())
      .get("/ti/inventory/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
  });

  it("POST /ti/inventory creates an asset", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        asset_code: "NB-001",
        category_id: categoryId,
        location_id: locationId,
        notes: "Notebook Dell",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        asset_code: "NB-001",
        category_id: categoryId,
        location_id: locationId,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/inventory requires admin permission", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({
        asset_code: "NB-001",
        category_id: categoryId,
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("POST /ti/inventory validates asset_code", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        asset_code: "",
        category_id: categoryId,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "asset_code é obrigatório.",
      code: "BAD_REQUEST",
    });
  });

  it("PATCH /ti/inventory/:id/assign-user assigns an asset", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/inventory/${assetId}/assign-user`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ user_id: userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: assetId,
        user_id: userId,
        return_date: null,
      },
    });
  });

  it("PATCH /ti/inventory/:id/return returns an asset", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/inventory/${assetId}/return`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ notes: "Devolvido sem avarias." });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: assetId,
        user_id: null,
        notes: "Devolvido sem avarias.",
      },
    });
  });

  it("POST /ti/inventory-categories creates a category", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory-categories")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Notebooks", tag: "NB" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Notebooks",
        tag: "NB",
        active: true,
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/inventory-locations creates a location", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory-locations")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ name: "Almoxarifado TI" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Almoxarifado TI",
        active: true,
        organization_id: organizationId,
      },
    });
  });
});

import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000001";
const locationId = "30000000-0000-4000-8000-000000000001";
const assetId = "40000000-0000-4000-8000-000000000001";
const inactiveUserId = "00000000-0000-4000-8000-000000000002";
const nonTechnologyUserId = "00000000-0000-4000-8000-000000000003";
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

describe("ti inventory routes", () => {
  it.each([
    "/ti/inventory/list",
    `/ti/inventory/${assetId}`,
  ])("GET %s rejects viewer permission", async (path) => {
    const response = await request(createTestApp())
      .get(path)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissão insuficiente para acessar o módulo de TI.",
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

  it("GET /ti/inventory/list accepts available status for term selectors", async () => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .get("/ti/inventory/list")
      .query({ status: "available", page_size: "100" })
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [],
    });
    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: null,
        }),
        take: 100,
      }),
    );
  });

  it("GET /ti/inventory/list rejects unknown availability status", async () => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .get("/ti/inventory/list")
      .query({ status: "retired" })
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(400);
    expect(prisma.inventoryTecnologia.findMany).not.toHaveBeenCalled();
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
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({
        asset_code: "NB-001",
        category_id: categoryId,
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissão insuficiente para acessar o módulo de TI.",
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

  it("POST /ti/inventory rejects a responsible user outside Tecnologia", async () => {
    const response = await request(createTestApp())
      .post("/ti/inventory")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        asset_code: "NB-001",
        category_id: categoryId,
        responsible_it_staff_id: nonTechnologyUserId,
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      success: false,
      error: "Responsável de TI deve pertencer ao departamento Tecnologia.",
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

  it("PATCH /ti/inventory/:id/assign-user rejects an inactive user", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/inventory/${assetId}/assign-user`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ user_id: inactiveUserId });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: "Usuário não encontrado na organização.",
    });
  });

  it("PATCH /ti/inventory/:id/return returns an asset", async () => {
    const prisma = createPrismaMock();
    prisma.inventoryTecnologia.findFirst.mockResolvedValueOnce({
      id: assetId,
      category_id: categoryId,
      location_id: locationId,
      user_id: userId,
      return_date: null,
      organization_id: organizationId,
    });
    const response = await request(createTestApp(prisma))
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

  it("PATCH /ti/inventory/:id/return rejects an asset nobody holds", async () => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .patch(`/ti/inventory/${assetId}/return`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({});

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "O item não está com ninguém para ser devolvido.",
    });
    expect(prisma.inventoryEvents).toEqual([]);
  });

  // #1932: transferência e histórico patrimonial.
  it("PATCH /ti/inventory/:id/transfer moves an asset and records the event", async () => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .patch(`/ti/inventory/${assetId}/transfer`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ user_id: userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: assetId, user_id: userId, location_id: null, return_date: null },
    });
    expect(prisma.inventoryEvents).toEqual([
      {
        inventory_id: assetId,
        action: "transfer",
        from_user_id: null,
        from_location_id: locationId,
        to_user_id: userId,
        to_location_id: null,
        actor_user_id: userId,
        organization_id: organizationId,
      },
    ]);
  });

  it.each([
    ["sem destino", {}],
    ["pessoa e local ao mesmo tempo", { user_id: userId, location_id: locationId }],
    ["campo desconhecido", { user_id: userId, notes: "x" }],
  ])("PATCH /ti/inventory/:id/transfer rejects %s", async (_label, body) => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .patch(`/ti/inventory/${assetId}/transfer`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send(body);

    expect(response.status).toBe(400);
    expect(prisma.inventoryEvents).toEqual([]);
  });

  it("PATCH /ti/inventory/:id/transfer requires admin permission", async () => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .patch(`/ti/inventory/${assetId}/transfer`)
      .set(gatewayHeaders(2))
      .send({ user_id: userId });

    expect(response.status).toBe(403);
    expect(prisma.inventoryEvents).toEqual([]);
  });

  it("GET /ti/inventory/:id/history lists events for technicians and rejects viewers", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma);

    const viewer = await request(app)
      .get(`/ti/inventory/${assetId}/history`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));
    const technician = await request(app)
      .get(`/ti/inventory/${assetId}/history`)
      .query({ page: "1", page_size: "20" })
      .set(gatewayHeaders(2));

    expect(viewer.status).toBe(403);
    expect(technician.status).toBe(200);
    expect(technician.body).toMatchObject({ success: true, data: [] });
    expect(prisma.inventoryEventTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, inventory_id: assetId },
        take: 20,
      }),
    );
  });

  // #1933: troca entre pessoas e transferência em lote.
  const otherAssetId = "40000000-0000-4000-8000-000000000002";
  const otherUserId = "00000000-0000-4000-8000-000000000009";
  const movable = (id: string, holderId: string | null) => ({
    id,
    asset_code: id,
    category_id: categoryId,
    user_id: holderId,
    location_id: null,
    return_date: null,
  });

  it("POST /ti/inventory/transfer-batch moves every asset and records one event each", async () => {
    const prisma = createPrismaMock();
    prisma.inventoryTecnologia.findMany.mockResolvedValueOnce([
      movable(assetId, null),
      movable(otherAssetId, otherUserId),
    ]);
    const response = await request(createTestApp(prisma))
      .post("/ti/inventory/transfer-batch")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ asset_ids: [assetId, otherAssetId], user_id: userId });

    expect(response.status).toBe(200);
    expect(prisma.inventoryEvents.map((event) => [event.inventory_id, event.to_user_id])).toEqual([
      [assetId, userId],
      [otherAssetId, userId],
    ]);
  });

  it("POST /ti/inventory/swap swaps the holders of two assets", async () => {
    const prisma = createPrismaMock();
    prisma.inventoryTecnologia.findMany.mockResolvedValueOnce([
      movable(assetId, userId),
      movable(otherAssetId, otherUserId),
    ]);
    const response = await request(createTestApp(prisma))
      .post("/ti/inventory/swap")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ asset_id: assetId, other_asset_id: otherAssetId });

    expect(response.status).toBe(200);
    expect(
      prisma.inventoryEvents.map((event) => [event.action, event.from_user_id, event.to_user_id]),
    ).toEqual([
      ["swap", userId, otherUserId],
      ["swap", otherUserId, userId],
    ]);
  });

  it("POST /ti/inventory/transfer-batch reports blocking items with 409 and writes nothing", async () => {
    const prisma = createPrismaMock();
    prisma.inventoryTecnologia.findMany.mockResolvedValueOnce([movable(assetId, userId)]);
    const response = await request(createTestApp(prisma))
      .post("/ti/inventory/transfer-batch")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ asset_ids: [assetId], user_id: userId });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: "TI_INVENTORY_ITEMS_BLOCKED",
      error: `Nenhum item foi movimentado. Itens impeditivos: ${assetId} (já está no destino).`,
    });
    expect(prisma.inventoryEvents).toEqual([]);
  });

  it.each([
    ["/ti/inventory/transfer-batch", { asset_ids: [], user_id: userId }],
    ["/ti/inventory/transfer-batch", { asset_ids: [assetId, assetId], user_id: userId }],
    ["/ti/inventory/transfer-batch", { asset_ids: [assetId] }],
    [
      "/ti/inventory/transfer-batch",
      { asset_ids: [assetId], user_id: userId, location_id: locationId },
    ],
    ["/ti/inventory/swap", { asset_id: assetId, other_asset_id: assetId }],
    ["/ti/inventory/swap", { asset_id: assetId }],
  ])("POST %s rejects an invalid body %#", async (path, body) => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .post(path)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send(body);

    expect(response.status).toBe(400);
    expect(prisma.inventoryEvents).toEqual([]);
  });

  it.each([
    ["/ti/inventory/transfer-batch", { asset_ids: [assetId], user_id: userId }],
    ["/ti/inventory/swap", { asset_id: assetId, other_asset_id: otherAssetId }],
  ])("POST %s requires admin permission", async (path, body) => {
    const prisma = createPrismaMock();
    const response = await request(createTestApp(prisma))
      .post(path)
      .set(gatewayHeaders(2))
      .send(body);

    expect(response.status).toBe(403);
    expect(prisma.inventoryTecnologia.findMany).not.toHaveBeenCalled();
  });

  // #1934: mapa de equipamentos por usuário.
  it("GET /ti/inventory/equipment-map/:userId returns the map for technicians only", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma);
    const path = `/ti/inventory/equipment-map/${userId}`;

    const viewer = await request(app).get(path).set(gatewayHeaders(TI_VIEWER_PERMISSION));
    const technician = await request(app).get(path).set(gatewayHeaders(2));
    const invalid = await request(app)
      .get("/ti/inventory/equipment-map/nao-e-uuid")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(viewer.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(technician.status).toBe(200);
    expect(technician.body).toMatchObject({
      success: true,
      data: { equipment: [], connections: [] },
    });
    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, user_id: userId, return_date: null },
      }),
    );
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

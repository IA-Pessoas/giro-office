import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  inventoryFieldChanges,
  isSensitiveTiChange,
  listTiChangeHistory,
} from "../services/tiChangeHistoryService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
};
const assetId = "20000000-0000-4000-8000-000000000001";
const oldCategory = "60000000-0000-4000-8000-000000000001";
const newCategory = "60000000-0000-4000-8000-000000000002";

function database(history: unknown[] = []) {
  return {
    changeHistoryTecnologia: { findMany: vi.fn(async () => history) },
    inventoryTecnologia: {
      findMany: vi.fn(async () => [{ id: assetId, asset_code: "NB-001" }]),
    },
    inventoryCategoryTecnologia: {
      findMany: vi.fn(async () => [
        { id: oldCategory, name: "Notebook" },
        { id: newCategory, name: "Monitor" },
      ]),
    },
    user: {
      findMany: vi.fn(async () => [{ id: context.userId, name: "Ana", full_name: "Ana Souza" }]),
    },
  };
}

describe("inventoryFieldChanges", () => {
  const existing = {
    asset_code: "NB-001",
    category_id: oldCategory,
    notes: "Marca: Dell",
    delivery_date: new Date("2026-09-11T00:00:00.000Z"),
    responsible_it_staff_id: null,
    user_id: "00000000-0000-4000-8000-000000000009",
  };

  it("records one row per changed field with the values before and after", async () => {
    const db = database();

    const changes = await inventoryFieldChanges(db, context, assetId, existing, {
      asset_code: "NB-002",
      category_id: newCategory,
      notes: "Marca: Dell",
      delivery_date: "2026-09-12",
    });

    expect(changes).toEqual([
      expect.objectContaining({ field: "asset_code", before: "NB-001", after: "NB-002" }),
      // Categoria vai pelo nome da época, não pelo id.
      expect.objectContaining({ field: "category", before: "Notebook", after: "Monitor" }),
      expect.objectContaining({
        field: "delivery_date",
        before: "2026-09-11",
        after: "2026-09-12",
      }),
    ]);
    expect(changes[0]).toEqual({
      item_type: "inventory",
      item_id: assetId,
      field: "asset_code",
      before: "NB-001",
      after: "NB-002",
      note: "Atualização do item",
      actor_user_id: context.userId,
      organization_id: context.organizationId,
    });
    expect(db.inventoryCategoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [oldCategory, newCategory] }, organization_id: context.organizationId },
      }),
    );
  });

  it("records a swap between people who share the same displayed name", async () => {
    const db = database();
    db.user.findMany.mockResolvedValue([
      { id: "00000000-0000-4000-8000-0000000000a1", name: "Ana", full_name: "" },
      { id: "00000000-0000-4000-8000-0000000000a2", name: "Ana", full_name: "" },
    ] as never);

    const changes = await inventoryFieldChanges(
      db,
      context,
      assetId,
      { ...existing, responsible_it_staff_id: "00000000-0000-4000-8000-0000000000a1" },
      { responsible_it_staff_id: "00000000-0000-4000-8000-0000000000a2" },
    );

    expect(changes).toEqual([
      expect.objectContaining({ field: "responsible_it_staff", before: "Ana", after: "Ana" }),
    ]);
  });

  it("leaves holder, location and return to the asset movement history", async () => {
    const db = database();

    const changes = await inventoryFieldChanges(db, context, assetId, existing, {
      user_id: context.userId,
      location_id: "30000000-0000-4000-8000-000000000001",
      return_date: "2026-09-20",
      delivery_date: "2026-09-11",
    });

    expect(changes).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});

describe("listTiChangeHistory", () => {
  const row = (extra: Record<string, unknown>) => ({
    id: "h1",
    item_type: "inventory",
    item_id: assetId,
    field: "asset_code",
    before: "NB-000",
    after: "NB-001",
    note: "Atualização do item",
    actor_user_id: context.userId,
    created_at: new Date("2026-10-13T12:00:00.000Z"),
    organization_id: context.organizationId,
    ...extra,
  });

  it("lists item, action, author and moment newest first, scoped by organization", async () => {
    const db = database([row({})]);

    const result = await listTiChangeHistory(db, context, { item_type: "inventory" });

    expect(db.changeHistoryTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId, item_type: "inventory" },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: 0,
      take: 51,
    });
    expect(result).toEqual({
      page: 1,
      page_size: 50,
      hasMore: false,
      items: [
        {
          id: "h1",
          item_type: "inventory",
          item_id: assetId,
          item_label: "NB-001",
          field: "asset_code",
          before: "NB-000",
          after: "NB-001",
          masked: false,
          note: "Atualização do item",
          actor: { id: context.userId, name: "Ana", full_name: "Ana Souza" },
          created_at: new Date("2026-10-13T12:00:00.000Z"),
        },
      ],
    });
    // Autor e item só são procurados na organização do chamador.
    for (const lookup of [db.user.findMany, db.inventoryTecnologia.findMany]) {
      expect(lookup).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organization_id: context.organizationId }),
        }),
      );
    }
  });

  it("paginates and reports when there are older changes", async () => {
    const db = database([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);

    const result = await listTiChangeHistory(db, context, { page: 2, page_size: 2 });

    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.hasMore).toBe(true);
    expect(db.changeHistoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 3 }),
    );
  });

  it("never returns credential values, whatever was stored", async () => {
    const db = database([
      row({ id: "p1", item_type: "password", field: "login", before: "admin", after: "root" }),
      row({ id: "p2", item_type: "robot", field: "Senha", before: "abc", after: "def" }),
    ]);

    const result = await listTiChangeHistory(db, context, {});

    for (const item of result.items) {
      expect(item).toMatchObject({ before: null, after: null, masked: true });
    }
    expect(JSON.stringify(result)).not.toMatch(/admin|root|abc|def/);
  });

  it("treats password items and secret-like fields as sensitive", () => {
    expect(isSensitiveTiChange("password", "observacao")).toBe(true);
    expect(isSensitiveTiChange("robot", "senha_portal")).toBe(true);
    expect(isSensitiveTiChange("robot", "Token")).toBe(true);
    expect(isSensitiveTiChange("robot", "login")).toBe(true);
    expect(isSensitiveTiChange("robot", "pwd")).toBe(true);
    expect(isSensitiveTiChange("inventory", "asset_code")).toBe(false);
  });
});

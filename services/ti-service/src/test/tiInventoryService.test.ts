import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiInventoryService } from "../services/tiInventoryService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 3,
};

describe("TiInventoryService", () => {
  it("list applies bounded offset pagination", async () => {
    const prisma = {
      inventoryTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await service.list(context, { page: 2, page_size: 25 });

    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
      }),
    );
  });

  it("list selects only safe user fields", async () => {
    const prisma = {
      inventoryTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await service.list(context, {});

    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
          responsible_it_staff: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
        }),
      }),
    );
  });

  it("getById selects only safe user fields", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: "asset-1" })),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await service.getById(context, "10000000-0000-4000-8000-000000000010");

    expect(prisma.inventoryTecnologia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
          responsible_it_staff: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
        }),
      }),
    );
  });

  it("creates inventory asset with unique asset_code", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "asset-1", ...data })),
      },
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: "cat-1", active: true })),
      },
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async () => ({ id: "loc-1", active: true })),
      },
    };
    const service = new TiInventoryService(prisma as never);

    const result = await service.create(context, {
      asset_code: "NB-001",
      category_id: "20000000-0000-4000-8000-000000000001",
      location_id: "30000000-0000-4000-8000-000000000001",
      notes: "Notebook Dell",
    });

    expect(result).toMatchObject({ id: "asset-1", asset_code: "NB-001" });
  });

  it("throws 409 for duplicated asset_code in organization", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: "asset-1" })),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.create(context, {
        asset_code: "NB-001",
        category_id: "20000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Ja existe um ativo de TI com este codigo patrimonial.",
    });
  });
});

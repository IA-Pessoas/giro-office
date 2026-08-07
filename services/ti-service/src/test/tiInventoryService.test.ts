import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiInventoryService } from "../services/tiInventoryService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 2,
};

const categoryId = "20000000-0000-4000-8000-000000000001";
const locationId = "30000000-0000-4000-8000-000000000001";
const assetId = "40000000-0000-4000-8000-000000000001";
const inactiveUserId = "00000000-0000-4000-8000-000000000002";
const nonTechnologyUserId = "00000000-0000-4000-8000-000000000003";
const technologyDepartmentId = "50000000-0000-4000-8000-000000000001";

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

  it("list filters available inventory by missing user", async () => {
    const prisma = {
      inventoryTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await service.list(context, { status: "available" });

    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: null,
        }),
      }),
    );
  });

  it("list filters assigned inventory by present user", async () => {
    const prisma = {
      inventoryTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await service.list(context, { status: "assigned" });

    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: { not: null },
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

  it("rejects an inactive user when creating inventory assets", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(),
      },
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: categoryId, active: true })),
      },
      user: {
        findFirst: vi.fn(async ({ where }) =>
          where.status === "active" ? null : { id: inactiveUserId, status: "inactive" },
        ),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.create(context, {
        asset_code: "NB-001",
        category_id: categoryId,
        user_id: inactiveUserId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Usuario nao encontrado na organizacao.",
    });
  });

  it("rejects a responsible user outside Tecnologia when updating an inventory asset", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: assetId })),
        update: vi.fn(),
      },
      department: {
        findFirst: vi.fn(async () => ({ id: technologyDepartmentId })),
      },
      user: {
        findFirst: vi.fn(async ({ where }) =>
          where.department_id === technologyDepartmentId
            ? null
            : { id: nonTechnologyUserId, department_id: "department-rh", status: "active" },
        ),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.update(context, assetId, {
        responsible_it_staff_id: nonTechnologyUserId,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: "Responsavel de TI deve pertencer ao departamento Tecnologia.",
    });
  });

  it("uses the approved message when the inventory category does not exist", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(),
      },
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.create(context, {
        asset_code: "NB-001",
        category_id: categoryId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Categoria de inventario nao encontrada.",
    });
  });

  it("uses the approved message when the inventory location does not exist", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(),
      },
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: categoryId, active: true })),
      },
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.create(context, {
        asset_code: "NB-001",
        category_id: categoryId,
        location_id: locationId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Departamento/local de inventario nao encontrado.",
    });
  });

  it("rejects an inactive user when assigning an inventory asset", async () => {
    const prisma = {
      inventoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: assetId })),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(async ({ where }) =>
          where.status === "active" ? null : { id: inactiveUserId, status: "inactive" },
        ),
      },
    };
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.assignUser(context, assetId, { user_id: inactiveUserId }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Usuario nao encontrado na organizacao.",
    });
  });
});

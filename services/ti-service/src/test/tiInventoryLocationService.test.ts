import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiInventoryLocationService } from "../services/tiInventoryLocationService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
};

describe("TiInventoryLocationService", () => {
  it("lists locations scoped by organization", async () => {
    const prisma = {
      inventoryLocationTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryLocationService(prisma as never);

    await service.list(context);

    expect(prisma.inventoryLocationTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId },
      orderBy: { name: "asc" },
    });
  });

  it("creates active location for organization", async () => {
    const prisma = {
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "loc-1", ...data })),
      },
    };
    const service = new TiInventoryLocationService(prisma as never);

    const result = await service.create(context, { name: "Almoxarifado TI" });

    expect(result).toMatchObject({
      id: "loc-1",
      name: "Almoxarifado TI",
      active: true,
      organization_id: context.organizationId,
    });
  });

  it("throws 409 for duplicated active location in organization", async () => {
    const prisma = {
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async () => ({ id: "loc-1" })),
      },
    };
    const service = new TiInventoryLocationService(prisma as never);

    await expect(service.create(context, { name: "Almoxarifado TI" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Ja existe um local de inventario de TI ativo com este nome.",
    });
  });
});

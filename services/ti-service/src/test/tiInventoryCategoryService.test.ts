import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiInventoryCategoryService } from "../services/tiInventoryCategoryService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
};

describe("TiInventoryCategoryService", () => {
  it("lists categories scoped by organization", async () => {
    const prisma = {
      inventoryCategoryTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiInventoryCategoryService(prisma as never);

    await service.list(context);

    expect(prisma.inventoryCategoryTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId },
      orderBy: { name: "asc" },
    });
  });

  it("creates active category for organization", async () => {
    const prisma = {
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      },
    };
    const service = new TiInventoryCategoryService(prisma as never);

    const result = await service.create(context, { name: "Notebook", tag: "NB" });

    expect(result).toMatchObject({
      id: "cat-1",
      name: "Notebook",
      tag: "NB",
      active: true,
      organization_id: context.organizationId,
    });
  });

  it("throws 409 for duplicated active category in organization", async () => {
    const prisma = {
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => ({ id: "cat-1" })),
      },
    };
    const service = new TiInventoryCategoryService(prisma as never);

    await expect(service.create(context, { name: "Notebook" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Já existe uma categoria de inventário de TI ativa com este nome.",
    });
  });
});

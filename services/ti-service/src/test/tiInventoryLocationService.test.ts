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
        findMany: vi.fn(async () => []),
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
        findMany: vi.fn(async () => [{ id: "loc-1", name: "Almoxarifado TI" }]),
      },
    };
    const service = new TiInventoryLocationService(prisma as never);

    // Caixa, acento e espaços não criam um segundo local.
    for (const name of ["Almoxarifado TI", " almoxarifado  ti "]) {
      await expect(service.create(context, { name })).rejects.toMatchObject({
        statusCode: 409,
        message: "Já existe um local de inventário de TI ativo com este nome.",
      });
    }
    expect(prisma.inventoryLocationTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId, active: true },
      select: { id: true, name: true },
    });
  });

  // #1937: renomear ou reativar também respeita o nome único; o item histórico não muda.
  describe("update", () => {
    const sala = { id: "loc-1", name: "Sala A", active: true };
    const deposito = { id: "loc-2", name: "Depósito", active: true };
    const antigo = { id: "loc-3", name: "Depósito", active: false };

    function prismaWith(existing: { id: string; name: string; active: boolean }) {
      return {
        inventoryLocationTecnologia: {
          findFirst: vi.fn(async () => existing),
          findMany: vi.fn(async () => [sala, deposito]),
          update: vi.fn(async ({ data }) => ({ ...existing, ...data })),
        },
        inventoryTecnologia: { updateMany: vi.fn() },
      };
    }

    it("refuses to rename into the name of another active location", async () => {
      const prisma = prismaWith(sala);
      const service = new TiInventoryLocationService(prisma as never);

      await expect(service.update(context, sala.id, { name: "deposito" })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(prisma.inventoryLocationTecnologia.update).not.toHaveBeenCalled();
    });

    it("refuses to reactivate a location whose name is already in use", async () => {
      const prisma = prismaWith(antigo);
      const service = new TiInventoryLocationService(prisma as never);

      await expect(service.update(context, antigo.id, { active: true })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("allows fixing its own spelling and deactivating without touching the assets", async () => {
      const prisma = prismaWith(sala);
      const service = new TiInventoryLocationService(prisma as never);

      await service.update(context, sala.id, { name: "SALA A" });
      await service.update(context, sala.id, { active: false });

      expect(prisma.inventoryLocationTecnologia.update).toHaveBeenCalledTimes(2);
      // Desativar não confere nome nem altera os itens que apontam para o local.
      expect(prisma.inventoryLocationTecnologia.findMany).not.toHaveBeenCalled();
      expect(prisma.inventoryTecnologia.updateMany).not.toHaveBeenCalled();
    });

    it("does not find a location from another organization", async () => {
      const prisma = prismaWith(sala);
      prisma.inventoryLocationTecnologia.findFirst.mockResolvedValue(null as never);
      const service = new TiInventoryLocationService(prisma as never);

      await expect(service.update(context, sala.id, { name: "Outra" })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(prisma.inventoryLocationTecnologia.findFirst).toHaveBeenCalledWith({
        where: { id: sala.id, organization_id: context.organizationId },
      });
    });
  });
});

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
        findMany: vi.fn(async () => []),
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
        findMany: vi.fn(async () => [{ id: "cat-1", name: "Notebook" }]),
      },
    };
    const service = new TiInventoryCategoryService(prisma as never);

    for (const name of ["Notebook", " NOTEBOOK "]) {
      await expect(service.create(context, { name })).rejects.toMatchObject({
        statusCode: 409,
        message: "Já existe uma categoria de inventário de TI ativa com este nome.",
      });
    }
  });

  // #1937: renomear ou reativar também respeita o nome único.
  it("refuses to rename or reactivate a category into a name already in use", async () => {
    const monitor = { id: "cat-2", name: "Monitor", active: true };
    const oldNotebook = { id: "cat-3", name: "Notebook", active: false };
    const update = vi.fn(async ({ data }) => data);
    const prismaWith = (existing: unknown) => ({
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async () => existing),
        findMany: vi.fn(async () => [{ id: "cat-1", name: "Notebook" }, monitor]),
        update,
      },
    });

    await expect(
      new TiInventoryCategoryService(prismaWith(monitor) as never).update(context, monitor.id, {
        name: "notebook",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      new TiInventoryCategoryService(prismaWith(oldNotebook) as never).update(
        context,
        oldNotebook.id,
        { active: true },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(update).not.toHaveBeenCalled();

    // Só a tag, ou desativar, não esbarra em nome.
    await new TiInventoryCategoryService(prismaWith(monitor) as never).update(context, monitor.id, {
      tag: "MON",
    });
    await new TiInventoryCategoryService(prismaWith(monitor) as never).update(context, monitor.id, {
      active: false,
    });
    expect(update).toHaveBeenCalledTimes(2);
  });
  // #1931: Computador é a categoria canônica da regra do computador ativo.
  describe("categoria canônica Computador", () => {
    const prismaWith = (
      categories: Array<{ id: string; name: string }>,
      activeAssets: Array<{ user_id: string }> = [],
    ) => ({
      inventoryTecnologia: { findMany: vi.fn(async () => activeAssets) },
      inventoryCategoryTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: { id?: string; name?: string } }) =>
          where.id
            ? (categories.find((category) => category.id === where.id) ?? null)
            : (categories.find((category) => category.name === where.name) ?? null),
        ),
        findMany: vi.fn(async () => categories),
        create: vi.fn(async ({ data }) => ({ id: "cat-new", ...data })),
        update: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      },
    });

    it("não cria uma segunda categoria Computador, mesmo com outra grafia", async () => {
      const prisma = prismaWith([{ id: "cat-1", name: "Computador" }]);
      const service = new TiInventoryCategoryService(prisma as never);

      await expect(service.create(context, { name: " computador " })).rejects.toMatchObject({
        statusCode: 409,
        message: "Já existe a categoria Computador nesta organização.",
      });
      expect(prisma.inventoryCategoryTecnologia.create).not.toHaveBeenCalled();
    });

    it("não renomeia nem desativa a categoria Computador", async () => {
      const prisma = prismaWith([{ id: "cat-1", name: "Computador" }]);
      const service = new TiInventoryCategoryService(prisma as never);

      await expect(service.update(context, "cat-1", { name: "Desktop" })).rejects.toMatchObject({
        statusCode: 409,
      });
      await expect(service.update(context, "cat-1", { active: false })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(prisma.inventoryCategoryTecnologia.update).not.toHaveBeenCalled();

      await service.update(context, "cat-1", { tag: "PC" });
      expect(prisma.inventoryCategoryTecnologia.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { tag: "PC" },
      });
    });

    it("só renomeia para Computador se ninguém tiver dois itens ativos da categoria", async () => {
      const blocked = prismaWith(
        [{ id: "cat-2", name: "Desktop" }],
        [{ user_id: "user-1" }, { user_id: "user-2" }, { user_id: "user-1" }],
      );
      await expect(
        new TiInventoryCategoryService(blocked as never).update(context, "cat-2", {
          name: "Computador",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "Há pessoas com mais de um item ativo nesta categoria; ela não pode virar Computador.",
      });
      expect(blocked.inventoryTecnologia.findMany).toHaveBeenCalledWith({
        where: {
          organization_id: context.organizationId,
          category_id: "cat-2",
          user_id: { not: null },
          return_date: null,
        },
        select: { user_id: true },
      });
      expect(blocked.inventoryCategoryTecnologia.update).not.toHaveBeenCalled();

      const allowed = prismaWith(
        [{ id: "cat-2", name: "Desktop" }],
        [{ user_id: "user-1" }, { user_id: "user-2" }],
      );
      await new TiInventoryCategoryService(allowed as never).update(context, "cat-2", {
        name: "Computador",
      });
      expect(allowed.inventoryCategoryTecnologia.update).toHaveBeenCalled();
    });

    it("não renomeia outra categoria para Computador quando ela já existe", async () => {
      const prisma = prismaWith([
        { id: "cat-1", name: "Computador" },
        { id: "cat-2", name: "Desktop" },
      ]);
      const service = new TiInventoryCategoryService(prisma as never);

      await expect(service.update(context, "cat-2", { name: "COMPUTADOR" })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(prisma.inventoryCategoryTecnologia.update).not.toHaveBeenCalled();
    });
  });
});

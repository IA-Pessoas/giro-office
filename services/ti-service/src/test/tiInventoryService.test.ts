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
      message: "Já existe um ativo de TI com este código patrimonial.",
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
      message: "Usuário não encontrado na organização.",
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
      message: "Responsável de TI deve pertencer ao departamento Tecnologia.",
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
      message: "Categoria de inventário não encontrada.",
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
      message: "Departamento/local de inventário não encontrado.",
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
      message: "Usuário não encontrado na organização.",
    });
  });
});

// #1931: uma pessoa não termina com mais de um computador ativo na organização.
describe("TiInventoryService: regra do computador ativo", () => {
  const computerCategoryId = "20000000-0000-4000-8000-0000000000c1";
  const monitorCategoryId = "20000000-0000-4000-8000-0000000000c2";
  const userId = "00000000-0000-4000-8000-0000000000a1";
  const otherUserId = "00000000-0000-4000-8000-0000000000a2";

  type Asset = {
    id: string;
    organization_id: string;
    asset_code: string;
    category_id: string;
    user_id: string | null;
    return_date: Date | null;
  };

  const asset = (id: string, overrides: Partial<Asset> = {}): Asset => ({
    id,
    organization_id: context.organizationId,
    asset_code: id,
    category_id: computerCategoryId,
    user_id: null,
    return_date: null,
    ...overrides,
  });

  // Prisma em memória: o bloqueio consultivo enfileira as transações da mesma chave, como
  // o pg_advisory_xact_lock, e a leitura demora o bastante para duas escritas se cruzarem.
  function inMemoryPrisma(seed: Asset[]) {
    const assets = seed.map((item) => ({ ...item }));
    const queues = new Map<string, Promise<void>>();
    const lockedKeys: string[] = [];
    const matches = (item: Asset, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, expected]) => {
        if (key === "NOT") return item.id !== (expected as { id: string }).id;
        if (key === "category_id" && expected && typeof expected === "object") {
          return (expected as { in: string[] }).in.includes(item.category_id);
        }
        return item[key as keyof Asset] === expected;
      });
    const client = {
      inventoryTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return assets.find((item) => matches(item, where)) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Partial<Asset> }) => {
          const created = asset(`created-${assets.length}`, data);
          assets.push(created);
          return created;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Asset> }) => {
          const found = assets.find((item) => item.id === where.id);
          if (!found) throw new Error("ativo inexistente");
          return Object.assign(found, data);
        }),
      },
      inventoryCategoryTecnologia: {
        findMany: vi.fn(async () => [
          { id: computerCategoryId, name: "computador " },
          { id: monitorCategoryId, name: "Monitor" },
        ]),
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      },
      user: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      },
    };
    const prisma = {
      ...client,
      $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => {
        const releases: Array<() => void> = [];
        const transaction = {
          ...client,
          $executeRaw: vi.fn(async (_query: TemplateStringsArray, key: string) => {
            lockedKeys.push(key);
            const previous = queues.get(key) ?? Promise.resolve();
            let release = () => {};
            const held = new Promise<void>((resolve) => {
              release = resolve;
            });
            queues.set(
              key,
              previous.then(() => held),
            );
            await previous;
            releases.push(release);
          }),
        };
        try {
          return await callback(transaction);
        } finally {
          for (const release of releases) release();
        }
      }),
    };
    const activeComputers = (user: string) =>
      assets.filter(
        (item) =>
          item.user_id === user && item.category_id === computerCategoryId && !item.return_date,
      );
    return { prisma, assets, activeComputers, lockedKeys };
  }

  it("recusa atribuir um segundo computador ativo à mesma pessoa", async () => {
    const { prisma, activeComputers } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-2"),
    ]);
    const service = new TiInventoryService(prisma as never);

    await expect(service.assignUser(context, "pc-2", { user_id: userId })).rejects.toMatchObject({
      statusCode: 409,
      message: "Esse usuário já possui um computador ativo.",
    });
    expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-1"]);
  });

  it("recusa cadastrar um computador já atribuído a quem tem um ativo", async () => {
    const { prisma, assets } = inMemoryPrisma([asset("pc-1", { user_id: userId })]);
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.create(context, {
        asset_code: "PC-NOVO",
        category_id: computerCategoryId,
        user_id: userId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(assets).toHaveLength(1);
  });

  it("recusa editar o responsável ou a categoria para um segundo computador ativo", async () => {
    const { prisma, activeComputers } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-2", { user_id: otherUserId }),
      asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await expect(service.update(context, "pc-2", { user_id: userId })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      service.update(context, "monitor-1", { category_id: computerCategoryId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-1"]);
  });

  it("libera o computador depois da devolução e ignora itens já devolvidos", async () => {
    const { prisma, activeComputers } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-2"),
      // Legado migrado: devolvido, mas ainda aponta para a última pessoa.
      asset("pc-antigo", { user_id: otherUserId, return_date: new Date("2024-01-10") }),
      asset("pc-3"),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.returnAsset(context, "pc-1", {});
    await service.assignUser(context, "pc-2", { user_id: userId });
    await service.assignUser(context, "pc-3", { user_id: otherUserId });

    expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-2"]);
    expect(activeComputers(otherUserId).map((item) => item.id)).toEqual(["pc-3"]);
  });

  it("editar a pessoa de um item devolvido reatribui e passa pela regra", async () => {
    const { prisma, assets, activeComputers } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-devolvido", { return_date: new Date("2026-09-10") }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await expect(
      service.update(context, "pc-devolvido", { user_id: userId }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await service.update(context, "pc-devolvido", { user_id: otherUserId });
    expect(assets.find((item) => item.id === "pc-devolvido")).toMatchObject({
      user_id: otherUserId,
      return_date: null,
    });
    expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-1"]);
  });

  // Legado: a troca do PHP não validava, então há quem tenha migrado com dois computadores.
  it("edição que não troca pessoa nem categoria não reavalia a regra", async () => {
    const { prisma } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-2", { user_id: userId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.update(context, "pc-2", { notes: "Revisado", user_id: userId });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.inventoryTecnologia.update).toHaveBeenCalledWith({
      where: { id: "pc-2" },
      data: { notes: "Revisado", user_id: userId, return_date: null },
    });
  });

  it("não aplica a regra nem abre transação para outras categorias", async () => {
    const { prisma, assets } = inMemoryPrisma([
      asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
      asset("monitor-2", { category_id: monitorCategoryId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.assignUser(context, "monitor-2", { user_id: userId });

    expect(assets.filter((item) => item.user_id === userId)).toHaveLength(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("escritas simultâneas deixam um só computador ativo por pessoa", async () => {
    const { prisma, activeComputers, lockedKeys } = inMemoryPrisma([
      asset("pc-1"),
      asset("pc-2"),
      asset("pc-3", { user_id: otherUserId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    const results = await Promise.allSettled([
      service.assignUser(context, "pc-1", { user_id: userId }),
      service.assignUser(context, "pc-2", { user_id: userId }),
      service.create(context, {
        asset_code: "PC-NOVO",
        category_id: computerCategoryId,
        user_id: userId,
      }),
      service.update(context, "pc-3", { user_id: userId }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results.flatMap((result) => (result.status === "rejected" ? [result.reason.statusCode] : [])),
    ).toEqual([409, 409, 409]);
    expect(activeComputers(userId)).toHaveLength(1);
    // O bloqueio é por organização e pessoa.
    expect(new Set(lockedKeys)).toEqual(
      new Set([`ti.inventory.active-computer:${context.organizationId}:${userId}`]),
    );
  });
});

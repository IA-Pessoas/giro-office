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
    location_id: string | null;
    return_date: Date | null;
  };

  const asset = (id: string, overrides: Partial<Asset> = {}): Asset => ({
    id,
    organization_id: context.organizationId,
    asset_code: id,
    category_id: computerCategoryId,
    user_id: null,
    location_id: null,
    return_date: null,
    ...overrides,
  });

  // Prisma em memória: o bloqueio consultivo enfileira as transações da mesma chave, como
  // o pg_advisory_xact_lock, e a leitura demora o bastante para duas escritas se cruzarem.
  function inMemoryPrisma(seed: Asset[]) {
    const assets = seed.map((item) => ({ ...item }));
    const queues = new Map<string, Promise<void>>();
    const lockedKeys: string[] = [];
    const events: Array<Record<string, unknown>> = [];
    const changes: Array<Record<string, unknown>> = [];
    const matches = (item: Asset, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, expected]) => {
        if (key === "NOT") return item.id !== (expected as { id: string }).id;
        const value = item[key as keyof Asset];
        if (expected && typeof expected === "object" && !(expected instanceof Date)) {
          const filter = expected as { in?: unknown[]; notIn?: unknown[] };
          if (filter.in) return filter.in.includes(value);
          if (filter.notIn) return !filter.notIn.includes(value);
        }
        return value === expected;
      });
    const client = {
      inventoryTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          // Lê uma cópia e só então demora: quem leu não enxerga as escritas seguintes.
          const found = assets.find((item) => matches(item, where));
          const snapshot = found ? { ...found } : null;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return snapshot;
        }),
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const found = assets.filter((item) => matches(item, where)).map((item) => ({ ...item }));
          await new Promise((resolve) => setTimeout(resolve, 5));
          return found;
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
        updateMany: vi.fn(
          async ({ where, data }: { where: Record<string, unknown>; data: Partial<Asset> }) => {
            const found = assets.filter((item) => matches(item, where));
            for (const item of found) Object.assign(item, data);
            return { count: found.length };
          },
        ),
      },
      inventoryEventTecnologia: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          events.push(data);
          return data;
        }),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          events.push(...data);
          return { count: data.length };
        }),
      },
      changeHistoryTecnologia: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          changes.push(...data);
          return { count: data.length };
        }),
      },
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
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
        // Desfaz as escritas desta transação se ela falhar, como o rollback do banco.
        const undo: Array<() => void> = [];
        const transaction = {
          ...client,
          inventoryTecnologia: {
            ...client.inventoryTecnologia,
            updateMany: async (args: { where: Record<string, unknown>; data: Partial<Asset> }) => {
              for (const item of assets.filter((candidate) => matches(candidate, args.where))) {
                const before = { ...item };
                undo.push(() => Object.assign(item, before));
              }
              return client.inventoryTecnologia.updateMany(args);
            },
          },
          inventoryEventTecnologia: {
            create: async (args: { data: Record<string, unknown> }) => {
              undo.push(() => events.splice(events.indexOf(args.data), 1));
              return client.inventoryEventTecnologia.create(args);
            },
            createMany: async (args: { data: Array<Record<string, unknown>> }) => {
              undo.push(() => events.splice(events.indexOf(args.data[0] ?? {}), args.data.length));
              return client.inventoryEventTecnologia.createMany(args);
            },
          },
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
        } catch (error) {
          for (const revert of undo.reverse()) revert();
          throw error;
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
    return { prisma, assets, activeComputers, lockedKeys, events, changes };
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
    const { prisma, lockedKeys, changes, events } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-2", { user_id: userId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.update(context, "pc-2", { notes: "Revisado", user_id: userId });

    expect(lockedKeys).toEqual([]);
    expect(prisma.inventoryTecnologia.update).toHaveBeenCalledWith({
      where: { id: "pc-2" },
      data: { notes: "Revisado", user_id: userId },
    });
    // #1936: o campo editado entra no histórico de alterações, não no patrimonial.
    expect(changes).toEqual([
      {
        item_type: "inventory",
        item_id: "pc-2",
        field: "notes",
        before: null,
        after: "Revisado",
        note: "Atualização do item",
        actor_user_id: context.userId,
        organization_id: context.organizationId,
      },
    ]);
    expect(events).toEqual([]);
  });

  // O formulário reenvia a pessoa: num item legado já devolvido isso não pode reatribuí-lo.
  it("editar as notas de um item devolvido que ainda aponta para a pessoa não o reatribui", async () => {
    const returnedAt = new Date("2024-01-10");
    const { prisma, assets, events, lockedKeys } = inMemoryPrisma([
      asset("pc-1", { user_id: userId }),
      asset("pc-antigo", { user_id: userId, return_date: returnedAt }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.update(context, "pc-antigo", { notes: "Revisado", user_id: userId });

    expect(lockedKeys).toEqual([]);
    expect(assets.find((item) => item.id === "pc-antigo")).toMatchObject({
      user_id: userId,
      return_date: returnedAt,
    });
    expect(events).toEqual([]);
  });

  it("recusa devolver um item que não está com ninguém", async () => {
    const { prisma, events } = inMemoryPrisma([
      asset("pc-livre"),
      asset("pc-antigo", { user_id: userId, return_date: new Date("2024-01-10") }),
    ]);
    const service = new TiInventoryService(prisma as never);

    for (const id of ["pc-livre", "pc-antigo"]) {
      await expect(service.returnAsset(context, id, {})).rejects.toMatchObject({
        statusCode: 409,
        message: "O item não está com ninguém para ser devolvido.",
      });
    }
    expect(events).toEqual([]);
  });

  it("edição e transferência simultâneas do mesmo item não se sobrepõem", async () => {
    const { prisma, assets, events } = inMemoryPrisma([
      asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    const results = await Promise.allSettled([
      service.update(context, "monitor-1", { location_id: "30000000-0000-4000-8000-0000000000c1" }),
      service.transfer(context, "monitor-1", { user_id: otherUserId }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results.flatMap((result) => (result.status === "rejected" ? [result.reason.statusCode] : [])),
    ).toEqual([409]);
    // O único evento gravado descreve o estado em que o item ficou.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      to_user_id: assets[0]?.user_id,
      to_location_id: assets[0]?.location_id,
    });
  });

  it("não aplica a regra nem toma o bloqueio para outras categorias", async () => {
    const { prisma, assets, lockedKeys } = inMemoryPrisma([
      asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
      asset("monitor-2", { category_id: monitorCategoryId }),
    ]);
    const service = new TiInventoryService(prisma as never);

    await service.assignUser(context, "monitor-2", { user_id: userId });
    await service.update(context, "monitor-2", { notes: "Revisado" });

    expect(assets.filter((item) => item.user_id === userId)).toHaveLength(2);
    expect(lockedKeys).toEqual([]);
  });

  // #1932: transferências nas quatro direções, com evento patrimonial por item.
  describe("transferências e histórico patrimonial", () => {
    const roomA = "30000000-0000-4000-8000-0000000000a1";
    const roomB = "30000000-0000-4000-8000-0000000000b1";
    const event = (overrides: Record<string, unknown>) => ({
      inventory_id: "monitor-1",
      action: "transfer",
      from_user_id: null,
      from_location_id: null,
      to_user_id: null,
      to_location_id: null,
      actor_user_id: context.userId,
      organization_id: context.organizationId,
      ...overrides,
    });

    it("move entre pessoas e locais e registra origem, destino, autor e ação", async () => {
      const { prisma, assets, events } = inMemoryPrisma([
        asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
      ]);
      const service = new TiInventoryService(prisma as never);
      const current = () => assets[0];

      await service.transfer(context, "monitor-1", { user_id: otherUserId });
      expect(current()).toMatchObject({ user_id: otherUserId, location_id: null });
      await service.transfer(context, "monitor-1", { location_id: roomA });
      expect(current()).toMatchObject({ user_id: null, location_id: roomA, return_date: null });
      await service.transfer(context, "monitor-1", { location_id: roomB });
      expect(current()).toMatchObject({ user_id: null, location_id: roomB });
      await service.transfer(context, "monitor-1", { user_id: userId });
      expect(current()).toMatchObject({ user_id: userId, location_id: null, return_date: null });

      expect(events).toEqual([
        event({ from_user_id: userId, to_user_id: otherUserId }),
        event({ from_user_id: otherUserId, to_location_id: roomA }),
        event({ from_location_id: roomA, to_location_id: roomB }),
        event({ from_location_id: roomB, to_user_id: userId }),
      ]);
    });

    it("atribuição e devolução também registram evento", async () => {
      const { prisma, events } = inMemoryPrisma([
        asset("monitor-1", { category_id: monitorCategoryId, location_id: roomA }),
      ]);
      const service = new TiInventoryService(prisma as never);

      await service.assignUser(context, "monitor-1", { user_id: userId });
      await service.returnAsset(context, "monitor-1", {});

      expect(events).toEqual([
        event({
          action: "assign",
          from_location_id: roomA,
          to_user_id: userId,
          to_location_id: roomA,
        }),
        event({
          action: "return",
          from_user_id: userId,
          from_location_id: roomA,
          to_location_id: roomA,
        }),
      ]);
    });

    it("cadastro já atribuído e edição de pessoa ou local também entram no histórico", async () => {
      const { prisma, assets, events } = inMemoryPrisma([]);
      const service = new TiInventoryService(prisma as never);

      await service.create(context, {
        asset_code: "MON-1",
        category_id: monitorCategoryId,
        user_id: userId,
        location_id: roomA,
      });
      const createdId = assets[0]?.id;
      await service.update(context, createdId, { user_id: otherUserId });
      await service.update(context, createdId, { location_id: roomB });
      // Edição que não muda pessoa nem local não gera evento.
      await service.update(context, createdId, { notes: "Revisado", location_id: roomB });

      expect(events).toEqual([
        event({
          inventory_id: createdId,
          action: "assign",
          to_user_id: userId,
          to_location_id: roomA,
        }),
        event({
          inventory_id: createdId,
          from_user_id: userId,
          from_location_id: roomA,
          to_user_id: otherUserId,
          to_location_id: roomA,
        }),
        event({
          inventory_id: createdId,
          from_user_id: otherUserId,
          from_location_id: roomA,
          to_user_id: otherUserId,
          to_location_id: roomB,
        }),
      ]);
    });

    it("recusa atribuir a quem já está com o item", async () => {
      const { prisma, events } = inMemoryPrisma([
        asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
      ]);
      const service = new TiInventoryService(prisma as never);

      await expect(
        service.assignUser(context, "monitor-1", { user_id: userId }),
      ).rejects.toMatchObject({ statusCode: 409, message: "O item já está com esta pessoa." });
      expect(events).toEqual([]);
    });

    it("recusa destino igual à origem e não registra evento", async () => {
      const { prisma, events } = inMemoryPrisma([
        asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
        asset("monitor-2", { category_id: monitorCategoryId, location_id: roomA }),
      ]);
      const service = new TiInventoryService(prisma as never);

      await expect(
        service.transfer(context, "monitor-1", { user_id: userId }),
      ).rejects.toMatchObject({ statusCode: 409, message: "O item já está com esta pessoa." });
      await expect(
        service.transfer(context, "monitor-2", { location_id: roomA }),
      ).rejects.toMatchObject({ statusCode: 409, message: "O item já está neste local." });
      expect(events).toEqual([]);
    });

    it("aplica a regra do computador ativo ao transferir para uma pessoa", async () => {
      const { prisma, assets, events, activeComputers } = inMemoryPrisma([
        asset("pc-1", { user_id: userId }),
        asset("pc-2", { location_id: roomA }),
        asset("pc-3", { user_id: otherUserId }),
      ]);
      const service = new TiInventoryService(prisma as never);

      await expect(service.transfer(context, "pc-2", { user_id: userId })).rejects.toMatchObject({
        statusCode: 409,
        message: "Esse usuário já possui um computador ativo.",
      });
      await expect(service.transfer(context, "pc-3", { user_id: userId })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(events).toEqual([]);
      expect(assets.find((item) => item.id === "pc-2")).toMatchObject({ location_id: roomA });

      // Depois que o computador vai para um local, a pessoa pode receber outro.
      await service.transfer(context, "pc-1", { location_id: roomB });
      await service.transfer(context, "pc-2", { user_id: userId });
      expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-2"]);
    });

    it("transferências simultâneas do mesmo item não se sobrepõem", async () => {
      const { prisma, events } = inMemoryPrisma([
        asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
      ]);
      const service = new TiInventoryService(prisma as never);

      const results = await Promise.allSettled([
        service.transfer(context, "monitor-1", { user_id: otherUserId }),
        service.transfer(context, "monitor-1", { location_id: roomA }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(
        results.flatMap((result) =>
          result.status === "rejected" ? [result.reason.statusCode] : [],
        ),
      ).toEqual([409]);
      expect(events).toHaveLength(1);
    });

    it("não transfere item de outra organização", async () => {
      const { prisma, events } = inMemoryPrisma([
        asset("monitor-1", { organization_id: "outra-organizacao" }),
      ]);
      const service = new TiInventoryService(prisma as never);

      await expect(
        service.transfer(context, "monitor-1", { user_id: userId }),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.listHistory(context, "monitor-1", {})).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(events).toEqual([]);
    });

    // #1933: troca entre pessoas e lote, numa operação que vale para todos ou nenhum.
    describe("troca e lote", () => {
      const thirdUserId = "00000000-0000-4000-8000-0000000000a3";
      const holders = (assets: Asset[]) =>
        Object.fromEntries(assets.map((item) => [item.id, item.user_id ?? item.location_id]));

      it("transfere vários itens para uma pessoa e registra um evento por item", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
          asset("monitor-2", { location_id: roomA, category_id: monitorCategoryId }),
          asset("pc-1", { user_id: userId }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await service.transferBatch(context, {
          asset_ids: ["monitor-1", "monitor-2", "pc-1"],
          user_id: otherUserId,
        });

        expect(holders(assets)).toEqual({
          "monitor-1": otherUserId,
          "monitor-2": otherUserId,
          "pc-1": otherUserId,
        });
        expect(events).toEqual([
          event({ from_user_id: userId, to_user_id: otherUserId }),
          event({ inventory_id: "monitor-2", from_location_id: roomA, to_user_id: otherUserId }),
          event({ inventory_id: "pc-1", from_user_id: userId, to_user_id: otherUserId }),
        ]);
      });

      it("transfere vários itens para um local", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("pc-1", { user_id: userId }),
          asset("pc-2", { user_id: otherUserId }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await service.transferBatch(context, { asset_ids: ["pc-1", "pc-2"], location_id: roomA });

        expect(assets.map((item) => [item.user_id, item.location_id])).toEqual([
          [null, roomA],
          [null, roomA],
        ]);
        expect(events).toHaveLength(2);
      });

      it("um item impeditivo desfaz o lote e a mensagem diz quais são", async () => {
        const seed = [
          asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
          asset("pc-1", { user_id: userId }),
          asset("pc-2", { location_id: roomA }),
          asset("ja-la", { user_id: otherUserId, category_id: monitorCategoryId }),
        ];
        const { prisma, assets, events } = inMemoryPrisma(seed);
        const service = new TiInventoryService(prisma as never);

        await expect(
          service.transferBatch(context, {
            asset_ids: ["monitor-1", "pc-1", "pc-2", "ja-la"],
            user_id: otherUserId,
          }),
        ).rejects.toMatchObject({
          statusCode: 409,
          code: "TI_INVENTORY_ITEMS_BLOCKED",
          message:
            "Nenhum item foi movimentado. Itens impeditivos: pc-1 (o usuário ficaria com mais de um computador ativo); pc-2 (o usuário ficaria com mais de um computador ativo); ja-la (já está no destino).",
        });
        expect(holders(assets)).toEqual(holders(seed));
        expect(events).toEqual([]);
      });

      it("recusa o lote que daria um segundo computador a quem já tem um", async () => {
        const { prisma, events } = inMemoryPrisma([
          asset("pc-1", { user_id: userId }),
          asset("pc-2", { user_id: otherUserId }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await expect(
          service.transferBatch(context, { asset_ids: ["pc-1"], user_id: otherUserId }),
        ).rejects.toMatchObject({
          statusCode: 409,
          message:
            "Nenhum item foi movimentado. Itens impeditivos: pc-1 (o usuário ficaria com mais de um computador ativo).",
        });
        expect(events).toEqual([]);
      });

      it("troca os computadores de duas pessoas sem ferir a regra do computador ativo", async () => {
        const { prisma, assets, events, activeComputers } = inMemoryPrisma([
          asset("pc-1", { user_id: userId, location_id: roomA }),
          asset("pc-2", { user_id: otherUserId }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await service.swap(context, { asset_id: "pc-1", other_asset_id: "pc-2" });

        expect(holders(assets)).toEqual({ "pc-1": otherUserId, "pc-2": userId });
        expect(activeComputers(userId).map((item) => item.id)).toEqual(["pc-2"]);
        expect(events).toEqual([
          event({
            inventory_id: "pc-1",
            action: "swap",
            from_user_id: userId,
            from_location_id: roomA,
            to_user_id: otherUserId,
          }),
          event({
            inventory_id: "pc-2",
            action: "swap",
            from_user_id: otherUserId,
            to_user_id: userId,
          }),
        ]);
      });

      it("recusa a troca que deixaria alguém com dois computadores ou sem duas pessoas", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("pc-1", { user_id: userId }),
          asset("monitor-2", { user_id: otherUserId, category_id: monitorCategoryId }),
          asset("pc-2", { user_id: otherUserId }),
          asset("sem-dono", { location_id: roomA }),
          asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
        ]);
        const service = new TiInventoryService(prisma as never);
        const before = holders(assets);

        // Quem recebe o pc-1 já tem o pc-2, que não entra na troca.
        await expect(
          service.swap(context, { asset_id: "pc-1", other_asset_id: "monitor-2" }),
        ).rejects.toMatchObject({ statusCode: 409, code: "TI_INVENTORY_ITEMS_BLOCKED" });
        await expect(
          service.swap(context, { asset_id: "pc-1", other_asset_id: "sem-dono" }),
        ).rejects.toMatchObject({
          statusCode: 409,
          message: "A troca exige dois itens que estejam com pessoas.",
        });
        await expect(
          service.swap(context, { asset_id: "pc-1", other_asset_id: "monitor-1" }),
        ).rejects.toMatchObject({
          statusCode: 409,
          message: "Os dois itens já estão com a mesma pessoa.",
        });
        expect(holders(assets)).toEqual(before);
        expect(events).toEqual([]);
      });

      it("recusa a troca com uma pessoa inativa", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("pc-1", { user_id: userId }),
          asset("pc-2", { user_id: otherUserId }),
        ]);
        // O ex-colaborador ainda aparece no item, mas não está ativo na organização.
        prisma.user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === otherUserId ? null : { id: where.id },
        );
        const service = new TiInventoryService(prisma as never);

        await expect(
          service.swap(context, { asset_id: "pc-1", other_asset_id: "pc-2" }),
        ).rejects.toMatchObject({
          statusCode: 404,
          message: "Usuário não encontrado na organização.",
        });
        expect(holders(assets)).toEqual({ "pc-1": userId, "pc-2": otherUserId });
        expect(events).toEqual([]);
      });

      it("não movimenta item de outra organização nem lote com item inexistente", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
          asset("alheio", { user_id: otherUserId, organization_id: "outra-organizacao" }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await expect(
          service.transferBatch(context, {
            asset_ids: ["monitor-1", "alheio"],
            user_id: thirdUserId,
          }),
        ).rejects.toMatchObject({ statusCode: 404 });
        await expect(
          service.swap(context, { asset_id: "monitor-1", other_asset_id: "alheio" }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(assets[0]).toMatchObject({ user_id: userId });
        expect(events).toEqual([]);
      });

      it("falha no meio do lote desfaz as escritas já feitas", async () => {
        const { prisma, assets, events } = inMemoryPrisma([
          asset("monitor-1", { user_id: userId, category_id: monitorCategoryId }),
          asset("monitor-2", { user_id: userId, category_id: monitorCategoryId }),
        ]);
        // Outra operação move o segundo item depois que o lote já gravou o primeiro.
        const writeAsset = prisma.inventoryTecnologia.updateMany.getMockImplementation();
        prisma.inventoryTecnologia.updateMany.mockImplementationOnce(async (args) => {
          const written = await writeAsset?.(args);
          const second = assets.find((item) => item.id === "monitor-2");
          if (second) second.user_id = thirdUserId;
          return written ?? { count: 0 };
        });
        const service = new TiInventoryService(prisma as never);

        await expect(
          service.transferBatch(context, {
            asset_ids: ["monitor-1", "monitor-2"],
            user_id: otherUserId,
          }),
        ).rejects.toMatchObject({
          statusCode: 409,
          message:
            "Nenhum item foi movimentado. Itens impeditivos: monitor-2 (movimentado por outra operação).",
        });
        expect(assets.find((item) => item.id === "monitor-1")).toMatchObject({ user_id: userId });
        expect(events).toEqual([]);
      });

      it("lotes simultâneos para a mesma pessoa deixam um só computador ativo", async () => {
        const { prisma, activeComputers, lockedKeys } = inMemoryPrisma([
          asset("pc-1", { location_id: roomA }),
          asset("pc-2", { location_id: roomA }),
        ]);
        const service = new TiInventoryService(prisma as never);

        const results = await Promise.allSettled([
          service.transferBatch(context, { asset_ids: ["pc-1"], user_id: userId }),
          service.transferBatch(context, { asset_ids: ["pc-2"], user_id: userId }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(activeComputers(userId)).toHaveLength(1);
        expect(new Set(lockedKeys)).toEqual(
          new Set([`ti.inventory.active-computer:${context.organizationId}:${userId}`]),
        );
      });

      it("trocas cruzadas tomam os bloqueios das pessoas na mesma ordem", async () => {
        const { prisma, lockedKeys } = inMemoryPrisma([
          asset("pc-1", { user_id: userId }),
          asset("pc-2", { user_id: otherUserId }),
        ]);
        const service = new TiInventoryService(prisma as never);

        await service.swap(context, { asset_id: "pc-1", other_asset_id: "pc-2" });
        const firstOrder = [...lockedKeys];
        lockedKeys.length = 0;
        await service.swap(context, { asset_id: "pc-1", other_asset_id: "pc-2" });

        expect(firstOrder).toEqual([...firstOrder].sort());
        expect(lockedKeys).toEqual(firstOrder);
      });
    });

    it("lista o histórico do item com nomes, só da organização", async () => {
      const createdAt = new Date("2026-10-13T12:00:00.000Z");
      const prisma = {
        inventoryTecnologia: { findFirst: vi.fn(async () => ({ id: "monitor-1" })) },
        inventoryEventTecnologia: {
          findMany: vi.fn(async () => [
            {
              id: "event-1",
              inventory_id: "monitor-1",
              action: "transfer",
              created_at: createdAt,
              actor_user_id: context.userId,
              from_user_id: userId,
              from_location_id: null,
              to_user_id: null,
              to_location_id: roomA,
            },
          ]),
        },
        user: {
          findMany: vi.fn(async () => [
            { id: context.userId, name: "tecnico", full_name: "Técnico" },
            { id: userId, name: "ana", full_name: "Ana" },
          ]),
        },
        inventoryLocationTecnologia: {
          findMany: vi.fn(async () => [{ id: roomA, name: "Sala A" }]),
        },
      };
      const service = new TiInventoryService(prisma as never);

      const history = await service.listHistory(context, "monitor-1", { page: 2, page_size: 10 });

      expect(history).toEqual([
        {
          id: "event-1",
          inventory_id: "monitor-1",
          action: "transfer",
          created_at: createdAt,
          actor: { id: context.userId, name: "tecnico", full_name: "Técnico" },
          from_user: { id: userId, name: "ana", full_name: "Ana" },
          to_user: null,
          from_location: null,
          to_location: { id: roomA, name: "Sala A" },
        },
      ]);
      expect(prisma.inventoryEventTecnologia.findMany).toHaveBeenCalledWith({
        where: { organization_id: context.organizationId, inventory_id: "monitor-1" },
        orderBy: { created_at: "desc" },
        skip: 10,
        take: 10,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [context.userId, userId] },
            organization_id: context.organizationId,
          },
        }),
      );
      expect(prisma.inventoryLocationTecnologia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [roomA] }, organization_id: context.organizationId },
        }),
      );
    });
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

// #1934: mapa de equipamentos por usuário, somente leitura e derivado só do inventário.
describe("TiInventoryService: mapa de equipamentos do usuário", () => {
  const mapUserId = "00000000-0000-4000-8000-0000000000b1";
  // Só os dois models que o mapa pode consultar: qualquer outro acesso (por exemplo o mapa de
  // grupos de clientes do Regularize, `tb_workspace.mapas` no legado) quebraria o teste.
  const prismaWith = (assets: unknown[], user: unknown = { id: mapUserId, name: "ana" }) => ({
    user: { findFirst: vi.fn(async () => user) },
    inventoryTecnologia: { findMany: vi.fn(async () => assets) },
  });

  it("monta o mapa com código, marca, entradas, configuração e conexões", async () => {
    const prisma = prismaWith([
      {
        id: "pc-1",
        asset_code: "PC-001",
        notes: "Marca: Dell\nEntradas: HDMI, VGA\nConfigurações: i5, 8GB",
        category: { name: "Computador" },
      },
      {
        id: "mon-1",
        asset_code: "MON-001",
        notes: "Marca: LG\nEntradas: HDMI",
        category: { name: "Monitor horizontal" },
      },
    ]);
    const service = new TiInventoryService(prisma as never);

    const map = await service.getUserEquipmentMap(context, mapUserId);

    expect(map).toEqual({
      user: { id: mapUserId, name: "ana" },
      equipment: [
        {
          id: "pc-1",
          asset_code: "PC-001",
          category: "Computador",
          is_host: true,
          brand: "Dell",
          inputs: ["HDMI", "VGA"],
          outputs: [],
          configuration: ["i5", "8GB"],
        },
        {
          id: "mon-1",
          asset_code: "MON-001",
          category: "Monitor horizontal",
          is_host: false,
          brand: "LG",
          inputs: ["HDMI"],
          outputs: [],
          configuration: [],
        },
      ],
      connections: [{ host_id: "pc-1", equipment_id: "mon-1", ports: ["HDMI"] }],
    });
    // Só os itens ativos da pessoa, dentro da organização de quem consulta.
    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: context.organizationId, user_id: mapUserId, return_date: null },
      }),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mapUserId, organization_id: context.organizationId },
      }),
    );
  });

  it("mostra o equipamento sem conexão quando a observação é ambígua ou não existe", async () => {
    const prisma = prismaWith([
      { id: "pc-1", asset_code: "PC-001", notes: null, category: { name: "Computador" } },
      {
        id: "mon-1",
        asset_code: "MON-001",
        notes: "ligado no HDMI do computador da Ana",
        category: { name: "Monitor" },
      },
    ]);
    const service = new TiInventoryService(prisma as never);

    expect(await service.getUserEquipmentMap(context, mapUserId)).toMatchObject({
      equipment: [
        { id: "pc-1", brand: null, inputs: [], configuration: [] },
        { id: "mon-1", brand: null, inputs: [], configuration: [] },
      ],
      connections: [],
    });
  });

  it("devolve mapa vazio para quem não tem equipamento e 404 para usuário de outra organização", async () => {
    const empty = new TiInventoryService(prismaWith([]) as never);
    expect(await empty.getUserEquipmentMap(context, mapUserId)).toMatchObject({
      equipment: [],
      connections: [],
    });

    const prisma = prismaWith([], null);
    await expect(
      new TiInventoryService(prisma as never).getUserEquipmentMap(context, mapUserId),
    ).rejects.toMatchObject({ statusCode: 404, message: "Usuário não encontrado na organização." });
    expect(prisma.inventoryTecnologia.findMany).not.toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createTiDomainServices, type TiDatabase } from "./domain.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "b0000000-0000-4000-8000-000000000002";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const DEPARTMENT_ID = "d0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "r0000000-0000-4000-8000-000000000001";

function database(overrides: Record<string, unknown> = {}): TiDatabase {
  return {
    department: {
      findFirst: vi.fn(async () => ({ id: DEPARTMENT_ID })),
    },
    inventoryCategoryTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    inventoryLocationTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    stock: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0),
    },
    tIRequest: {
      findFirst: vi.fn(async () => ({ assigned_to_id: USER_ID })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        status: "active",
        department_id: DEPARTMENT_ID,
      })),
      findMany: vi.fn(async () => []),
    },
    ...overrides,
  } as unknown as TiDatabase;
}

const auth = (overrides: Record<string, unknown> = {}) => ({
  organizationId: ORGANIZATION_ID,
  userId: USER_ID,
  permission: 1,
  ...overrides,
});

describe("TI domain", () => {
  // #1937: nome único ao cadastrar, renomear e reativar, nos três catálogos.
  it("keeps catalog names unique on create, rename and reactivation", async () => {
    const actives = [
      { id: "a", name: "Sala A", active: true, status: true },
      { id: "b", name: "Depósito", active: true, status: true },
    ];
    const inactive = { id: "c", name: "Depósito", active: false, status: false };
    const catalog = (existing: unknown) => ({
      findMany: vi.fn(async () => actives),
      findFirst: vi.fn(async () => existing),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    });
    const services = (existing: unknown) => {
      const models = {
        inventoryCategoryTecnologia: catalog(existing),
        inventoryLocationTecnologia: catalog(existing),
        locationStock: catalog(existing),
        inventoryTecnologia: { findMany: vi.fn(async () => []) },
      };
      return { models, domain: createTiDomainServices(database(models)) };
    };
    const conflict = { statusCode: 409 };

    const renaming = services(actives[0]);
    await expect(
      renaming.domain.inventoryLocations?.create?.(auth(), { name: " deposito " }),
    ).rejects.toMatchObject(conflict);
    await expect(
      renaming.domain.inventoryCategories?.create?.(auth(), { name: "DEPÓSITO" }),
    ).rejects.toMatchObject(conflict);
    await expect(
      renaming.domain.inventoryLocations?.update?.(auth(), "a", { name: "Deposito" }),
    ).rejects.toMatchObject(conflict);
    await expect(
      renaming.domain.inventoryCategories?.update?.(auth(), "a", { name: "Deposito" }),
    ).rejects.toMatchObject(conflict);
    await expect(
      renaming.domain.stock?.updateLocation?.(auth(), "a", { name: "Deposito" }),
    ).rejects.toMatchObject(conflict);

    const reactivating = services(inactive);
    await expect(
      reactivating.domain.inventoryLocations?.update?.(auth(), "c", { active: true }),
    ).rejects.toMatchObject(conflict);
    await expect(
      reactivating.domain.stock?.updateLocation?.(auth(), "c", { status: true }),
    ).rejects.toMatchObject(conflict);

    for (const { models } of [renaming, reactivating]) {
      for (const model of [
        models.inventoryCategoryTecnologia,
        models.inventoryLocationTecnologia,
        models.locationStock,
      ]) {
        expect(model.create).not.toHaveBeenCalled();
        expect(model.update).not.toHaveBeenCalled();
      }
    }

    // Ajustar a própria grafia, mudar outro campo ou desativar segue permitido.
    const editing = services(actives[0]);
    await editing.domain.inventoryLocations?.update?.(auth(), "a", { name: "SALA A" });
    await editing.domain.inventoryLocations?.update?.(auth(), "a", { active: false });
    editing.models.locationStock.findMany.mockResolvedValueOnce([]);
    await editing.domain.stock?.updateLocation?.(auth(), "a", { floor: 2 });
    expect(editing.models.inventoryLocationTecnologia.update).toHaveBeenCalledTimes(2);
    // Mudar de andar confere o nome entre os ativos do andar de destino.
    expect(editing.models.locationStock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ floor: 2 }) }),
    );
    expect(editing.models.locationStock.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { floor: 2 },
    });
    // A busca de ativos é sempre da organização (e, no estoque, do departamento de TI).
    expect(renaming.models.inventoryLocationTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID, active: true },
      select: { id: true, name: true },
    });
    expect(renaming.models.locationStock.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        department_id: DEPARTMENT_ID,
        status: true,
        floor: null,
      },
      select: { id: true, name: true },
    });
  });

  it("uses uuid defaults for stock categories and locations", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const locationModel = schema.split("model LocationStock {")[1]?.split("\nmodel ")[0];
    const categoryModel = schema.split("model CategoryStock {")[1]?.split("\nmodel ")[0];
    expect(locationModel).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/u);
    expect(categoryModel).toMatch(/id\s+String\s+@id\s+@default\(uuid\(\)\)/u);
  });

  it("does not require a category id in the create handler", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const db = database({
      stock: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        updateMany: vi.fn(async () => ({ count: 1 })),
        count: vi.fn(async () => 0),
      },
      categoryStock: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        create,
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
    });
    const service = createTiDomainServices(db).stock;

    await service?.createCategory?.(auth(), { name: "  Notebook  " });

    expect(create).toHaveBeenCalledWith({
      data: {
        name: "Notebook",
        department_id: DEPARTMENT_ID,
        organization_id: ORGANIZATION_ID,
        status: true,
      },
    });
  });

  it("maps a unique stock category race to conflict", async () => {
    const db = database({
      categoryStock: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw { code: "P2002" };
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
    });
    const service = createTiDomainServices(db).stock;

    await expect(service?.createCategory?.(auth(), { name: "Notebook" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // #1929: o TI nível 1 só enxerga e altera o que é dele.
  it("keeps TI level 1 restricted to own requests and messages", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const createMessage = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const findMany = vi.fn(async () => []);
    const db = database({
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: REQUEST_ID, requester_id: OTHER_USER_ID })),
        findMany,
        create,
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      tIMessage: { findMany: vi.fn(async () => []), create: createMessage },
      tICategoryRequest: { findFirst: vi.fn(async () => ({ id: "category-1" })) },
    });
    const service = createTiDomainServices(db).requests;

    await service?.list?.(auth(), { requester_id: OTHER_USER_ID });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: ORGANIZATION_ID,
          requester_id: USER_ID,
        }),
      }),
    );
    await expect(service?.getById?.(auth(), REQUEST_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service?.listMessages?.(auth(), REQUEST_ID, {})).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service?.createMessage?.(auth(), REQUEST_ID, { message: "Olá" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service?.create?.(auth(), { category_id: "category-1", requester_id: OTHER_USER_ID }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(createMessage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    await service?.create?.(auth(), { category_id: "category-1", title: "Monitor" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requester_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        status: "New",
      }),
    });
  });

  it("lets TI level 1 sign only the own term", async () => {
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "term-1",
      user_id: USER_ID,
      ...data,
    }));
    const findFirst = vi.fn(async () => ({ id: "term-1", user_id: OTHER_USER_ID }));
    const db = database({ termTecnologia: { findFirst, update } });
    const service = createTiDomainServices(db).terms;

    await expect(service?.sign?.(auth(), "term-1", {})).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(update).not.toHaveBeenCalled();

    findFirst.mockResolvedValueOnce({ id: "term-1", user_id: USER_ID });
    await expect(service?.sign?.(auth(), "term-1", {})).resolves.toMatchObject({
      status: "signed",
    });
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "term-1", organization_id: ORGANIZATION_ID } }),
    );
  });

  it("allows an organization owner with viewer permission to transfer a request", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const db = database({
      tIRequest: {
        findFirst: vi.fn(async () => ({ assigned_to_id: OTHER_USER_ID })),
        updateMany,
      },
    });
    const service = createTiDomainServices(db).requests;

    await service?.assign?.(auth({ isOrganizationOwner: true }), REQUEST_ID, {
      assigned_to_id: USER_ID,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, organization_id: ORGANIZATION_ID },
      data: { assigned_to_id: USER_ID },
    });
  });

  it("uses assigned_to_id as the optimistic concurrency guard", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const db = database({
      tIRequest: {
        findFirst: vi.fn(async () => ({ assigned_to_id: USER_ID })),
        updateMany,
      },
    });
    const service = createTiDomainServices(db).requests;

    await expect(
      service?.assign?.(auth(), REQUEST_ID, { assigned_to_id: OTHER_USER_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: REQUEST_ID,
        organization_id: ORGANIZATION_ID,
        assigned_to_id: USER_ID,
      },
      data: { assigned_to_id: OTHER_USER_ID },
    });
  });

  it("reads report pages from a RepeatableRead snapshot", async () => {
    const transaction = vi.fn(
      async (
        callback: (database: TiDatabase) => Promise<unknown>,
        _options: { isolationLevel: string },
      ) => callback(db),
    );
    const db = database({
      $transaction: transaction,
      stock: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        updateMany: vi.fn(async () => ({ count: 1 })),
        count: vi.fn(async () => 0),
      },
    });
    const reporting = createTiDomainServices(db).reporting;

    await reporting?.extract?.({
      organizationId: ORGANIZATION_ID,
      source: "ti.stock",
      fields: ["name"],
      limit: 10,
      query: {},
    });

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: "RepeatableRead",
        maxWait: 5_000,
        timeout: 30_000,
      }),
    );
  });
});

// #1931: uma pessoa não termina com mais de um computador ativo na organização.
describe("TI domain: regra do computador ativo", () => {
  const COMPUTER_CATEGORY_ID = "c0000000-0000-4000-8000-0000000000c1";
  const MONITOR_CATEGORY_ID = "c0000000-0000-4000-8000-0000000000c2";

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
    organization_id: ORGANIZATION_ID,
    asset_code: id,
    category_id: COMPUTER_CATEGORY_ID,
    user_id: null,
    location_id: null,
    return_date: null,
    ...overrides,
  });

  // Banco em memória: o bloqueio consultivo enfileira as transações da mesma chave, como o
  // pg_advisory_xact_lock, e a leitura demora o bastante para duas escritas se cruzarem.
  function inMemoryDatabase(
    seed: Asset[],
    categories = [
      { id: COMPUTER_CATEGORY_ID, name: "Computador", active: true },
      { id: MONITOR_CATEGORY_ID, name: "Monitor", active: true },
    ],
  ) {
    const assets = seed.map((item) => ({ ...item }));
    const queues = new Map<string, Promise<void>>();
    const lockedKeys: string[] = [];
    const events: Array<Record<string, unknown>> = [];
    const changes: Array<Record<string, unknown>> = [];
    const matches = (item: Asset, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, expected]) => {
        if (key === "NOT") return item.id !== (expected as { id: string }).id;
        if (key === "category_id" && expected && typeof expected === "object") {
          return (expected as { in: string[] }).in.includes(item.category_id);
        }
        if (key === "user_id" && expected && typeof expected === "object") {
          return item.user_id !== null;
        }
        return item[key as keyof Asset] === expected;
      });
    const models = {
      inventoryTecnologia: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          assets.filter((item) => matches(item, where)),
        ),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          // Lê uma cópia e só então demora: quem leu não enxerga as escritas seguintes.
          const found = assets.find((item) => matches(item, where));
          const snapshot = found ? { ...found } : null;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return snapshot;
        }),
        updateMany: vi.fn(
          async ({ where, data }: { where: Record<string, unknown>; data: Partial<Asset> }) => {
            const found = assets.filter((item) => matches(item, where));
            for (const item of found) Object.assign(item, data);
            return { count: found.length };
          },
        ),
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
        findMany: vi.fn(async () => categories),
        findFirst: vi.fn(
          async ({ where }: { where: { id?: string; name?: string } }) =>
            categories.find((category) =>
              where.id ? category.id === where.id : category.name === where.name,
            ) ?? null,
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
      user: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          status: "active",
        })),
      },
      changeHistoryTecnologia: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          changes.push(...data);
          return { count: data.length };
        }),
      },
      inventoryEventTecnologia: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          events.push(data);
          return data;
        }),
      },
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
      },
    };
    const transaction = vi.fn(async (callback: (database: TiDatabase) => Promise<unknown>) => {
      const releases: Array<() => void> = [];
      const scoped = {
        ...models,
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
        return await callback(scoped as unknown as TiDatabase);
      } finally {
        for (const release of releases) release();
      }
    });
    const db = { ...models, $transaction: transaction } as unknown as TiDatabase;
    const activeComputers = (user: string) =>
      assets.filter(
        (item) =>
          item.user_id === user && item.category_id === COMPUTER_CATEGORY_ID && !item.return_date,
      );
    return { db, models, transaction, assets, activeComputers, lockedKeys, events, changes };
  }

  it("recusa um segundo computador ativo em cadastro, edição e atribuição", async () => {
    const { db, assets, activeComputers } = inMemoryDatabase([
      asset("pc-1", { user_id: USER_ID }),
      asset("pc-2"),
      asset("pc-3", { user_id: OTHER_USER_ID }),
      asset("monitor-1", { user_id: USER_ID, category_id: MONITOR_CATEGORY_ID }),
    ]);
    const service = createTiDomainServices(db).inventory;
    const conflict = {
      statusCode: 409,
      message: "Esse usuário já possui um computador ativo.",
    };

    await expect(service?.assignUser?.(auth(), "pc-2", { user_id: USER_ID })).rejects.toMatchObject(
      conflict,
    );
    await expect(
      service?.create?.(auth(), {
        asset_code: "PC-NOVO",
        category_id: COMPUTER_CATEGORY_ID,
        user_id: USER_ID,
      }),
    ).rejects.toMatchObject(conflict);
    await expect(service?.update?.(auth(), "pc-3", { user_id: USER_ID })).rejects.toMatchObject(
      conflict,
    );
    await expect(
      service?.update?.(auth(), "monitor-1", { category_id: COMPUTER_CATEGORY_ID }),
    ).rejects.toMatchObject(conflict);

    expect(assets).toHaveLength(4);
    expect(activeComputers(USER_ID).map((item) => item.id)).toEqual(["pc-1"]);
  });

  it("libera depois da devolução, ignora devolvidos e não bloqueia outras categorias", async () => {
    const { db, lockedKeys, activeComputers, assets } = inMemoryDatabase([
      asset("pc-1", { user_id: USER_ID }),
      asset("pc-2"),
      // Legado migrado: devolvido, mas ainda aponta para a última pessoa.
      asset("pc-antigo", { user_id: OTHER_USER_ID, return_date: new Date("2024-01-10") }),
      asset("pc-3"),
      asset("monitor-1", { category_id: MONITOR_CATEGORY_ID }),
    ]);
    const service = createTiDomainServices(db).inventory;

    await service?.assignUser?.(auth(), "monitor-1", { user_id: USER_ID });
    expect(lockedKeys).toEqual([]);

    await service?.returnAsset?.(auth(), "pc-1", {});
    await service?.assignUser?.(auth(), "pc-2", { user_id: USER_ID });
    await service?.assignUser?.(auth(), "pc-3", { user_id: OTHER_USER_ID });

    expect(activeComputers(USER_ID).map((item) => item.id)).toEqual(["pc-2"]);
    expect(activeComputers(OTHER_USER_ID).map((item) => item.id)).toEqual(["pc-3"]);
    expect(assets.filter((item) => item.user_id === USER_ID)).toHaveLength(2);
  });

  it("editar a pessoa de um item devolvido reatribui e passa pela regra", async () => {
    const { db, assets, activeComputers } = inMemoryDatabase([
      asset("pc-1", { user_id: USER_ID }),
      asset("pc-devolvido", { return_date: new Date("2026-09-10") }),
    ]);
    const service = createTiDomainServices(db).inventory;

    await expect(
      service?.update?.(auth(), "pc-devolvido", { user_id: USER_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });

    await service?.update?.(auth(), "pc-devolvido", { user_id: OTHER_USER_ID });
    expect(assets.find((item) => item.id === "pc-devolvido")).toMatchObject({
      user_id: OTHER_USER_ID,
      return_date: null,
    });
    expect(activeComputers(USER_ID).map((item) => item.id)).toEqual(["pc-1"]);
  });

  // Legado: a troca do PHP não validava, então há quem tenha migrado com dois computadores.
  it("edição que não troca pessoa nem categoria não reavalia a regra", async () => {
    const { db, lockedKeys, models, changes, events } = inMemoryDatabase([
      asset("pc-1", { user_id: USER_ID }),
      asset("pc-2", { user_id: USER_ID }),
    ]);
    const service = createTiDomainServices(db).inventory;

    await service?.update?.(auth(), "pc-2", { notes: "Revisado", user_id: USER_ID });

    expect(lockedKeys).toEqual([]);
    expect(models.inventoryTecnologia.update).toHaveBeenCalledWith({
      where: { id: "pc-2" },
      data: { notes: "Revisado", user_id: USER_ID },
    });
    // #1936: o campo editado entra no histórico de alterações, não no patrimonial.
    expect(changes).toEqual([
      expect.objectContaining({
        item_type: "inventory",
        item_id: "pc-2",
        field: "notes",
        after: "Revisado",
        actor_user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
      }),
    ]);
    expect(events).toEqual([]);
  });

  it("só renomeia uma categoria para Computador se ninguém tiver dois itens ativos dela", async () => {
    const categories = [{ id: MONITOR_CATEGORY_ID, name: "Desktop", active: true }];
    const blocked = inMemoryDatabase(
      [
        asset("d-1", { user_id: USER_ID, category_id: MONITOR_CATEGORY_ID }),
        asset("d-2", { user_id: USER_ID, category_id: MONITOR_CATEGORY_ID }),
      ],
      categories,
    );
    await expect(
      createTiDomainServices(blocked.db).inventoryCategories?.update?.(
        auth(),
        MONITOR_CATEGORY_ID,
        { name: "Computador" },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(blocked.models.inventoryCategoryTecnologia.update).not.toHaveBeenCalled();

    const allowed = inMemoryDatabase(
      [
        asset("d-1", { user_id: USER_ID, category_id: MONITOR_CATEGORY_ID }),
        asset("d-2", { user_id: OTHER_USER_ID, category_id: MONITOR_CATEGORY_ID }),
        asset("d-3", {
          user_id: USER_ID,
          category_id: MONITOR_CATEGORY_ID,
          return_date: new Date("2025-01-01"),
        }),
      ],
      categories,
    );
    await createTiDomainServices(allowed.db).inventoryCategories?.update?.(
      auth(),
      MONITOR_CATEGORY_ID,
      { name: "Computador" },
    );
    expect(allowed.models.inventoryCategoryTecnologia.update).toHaveBeenCalled();
  });

  it("escritas simultâneas deixam um só computador ativo por pessoa", async () => {
    const { db, activeComputers, lockedKeys } = inMemoryDatabase([
      asset("pc-1"),
      asset("pc-2"),
      asset("pc-3", { user_id: OTHER_USER_ID }),
    ]);
    const service = createTiDomainServices(db).inventory;

    const results = await Promise.allSettled([
      service?.assignUser?.(auth(), "pc-1", { user_id: USER_ID }),
      service?.assignUser?.(auth(), "pc-2", { user_id: USER_ID }),
      service?.create?.(auth(), {
        asset_code: "PC-NOVO",
        category_id: COMPUTER_CATEGORY_ID,
        user_id: USER_ID,
      }),
      service?.update?.(auth(), "pc-3", { user_id: USER_ID }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results.flatMap((result) => (result.status === "rejected" ? [result.reason.statusCode] : [])),
    ).toEqual([409, 409, 409]);
    expect(activeComputers(USER_ID)).toHaveLength(1);
    expect(new Set(lockedKeys)).toEqual(
      new Set([`ti.inventory.active-computer:${ORGANIZATION_ID}:${USER_ID}`]),
    );
  });

  it("mantém Computador como categoria única, sem renomear nem desativar", async () => {
    const { db, models } = inMemoryDatabase(
      [],
      [
        { id: COMPUTER_CATEGORY_ID, name: "Computador", active: true },
        { id: MONITOR_CATEGORY_ID, name: "Monitor", active: true },
      ],
    );
    const service = createTiDomainServices(db).inventoryCategories;
    const locked = { statusCode: 409 };

    await expect(service?.create?.(auth(), { name: " computador " })).rejects.toMatchObject(locked);
    await expect(
      service?.update?.(auth(), COMPUTER_CATEGORY_ID, { name: "Desktop" }),
    ).rejects.toMatchObject(locked);
    await expect(
      service?.update?.(auth(), COMPUTER_CATEGORY_ID, { active: false }),
    ).rejects.toMatchObject(locked);
    await expect(
      service?.update?.(auth(), MONITOR_CATEGORY_ID, { name: "COMPUTADOR" }),
    ).rejects.toMatchObject(locked);
    expect(models.inventoryCategoryTecnologia.create).not.toHaveBeenCalled();
    expect(models.inventoryCategoryTecnologia.update).not.toHaveBeenCalled();

    await service?.update?.(auth(), COMPUTER_CATEGORY_ID, { tag: "PC" });
    expect(models.inventoryCategoryTecnologia.update).toHaveBeenCalledWith({
      where: { id: COMPUTER_CATEGORY_ID },
      data: { tag: "PC" },
    });
  });
});

// #1932: transferências nas quatro direções, com evento patrimonial por item.
describe("TI domain: transferências e histórico patrimonial", () => {
  const MONITOR_CATEGORY_ID = "c0000000-0000-4000-8000-0000000000c2";
  const COMPUTER_CATEGORY_ID = "c0000000-0000-4000-8000-0000000000c1";
  const ROOM_A = "30000000-0000-4000-8000-0000000000a1";
  const ROOM_B = "30000000-0000-4000-8000-0000000000b1";

  type Asset = Record<string, unknown> & { id: string };
  const asset = (id: string, overrides: Record<string, unknown> = {}): Asset => ({
    id,
    organization_id: ORGANIZATION_ID,
    category_id: MONITOR_CATEGORY_ID,
    user_id: null,
    location_id: null,
    return_date: null,
    ...overrides,
  });
  const event = (overrides: Record<string, unknown>) => ({
    inventory_id: "monitor-1",
    action: "transfer",
    from_user_id: null,
    from_location_id: null,
    to_user_id: null,
    to_location_id: null,
    actor_user_id: USER_ID,
    organization_id: ORGANIZATION_ID,
    ...overrides,
  });

  function store(seed: Asset[]) {
    const assets = seed.map((item) => ({ ...item }));
    const events: Array<Record<string, unknown>> = [];
    const changes: Array<Record<string, unknown>> = [];
    const lockedKeys: unknown[] = [];
    const queues = new Map<string, Promise<void>>();
    const matches = (item: Asset, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, expected]) => {
        if (key === "NOT") return item.id !== (expected as { id: string }).id;
        if (expected && typeof expected === "object" && !(expected instanceof Date)) {
          const filter = expected as { in?: unknown[]; notIn?: unknown[] };
          if (filter.in) return filter.in.includes(item[key]);
          if (filter.notIn) return !filter.notIn.includes(item[key]);
        }
        return item[key] === expected;
      });
    const models = {
      inventoryTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
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
        updateMany: vi.fn(
          async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
            const found = assets.filter((item) => matches(item, where));
            for (const item of found) Object.assign(item, data);
            return { count: found.length };
          },
        ),
      },
      inventoryCategoryTecnologia: {
        findMany: vi.fn(async () => [
          { id: COMPUTER_CATEGORY_ID, name: "Computador" },
          { id: MONITOR_CATEGORY_ID, name: "Monitor" },
        ]),
      },
      inventoryLocationTecnologia: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
        findMany: vi.fn(async () => [{ id: ROOM_A, name: "Sala A" }]),
      },
      changeHistoryTecnologia: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          changes.push(...data);
          return { count: data.length };
        }),
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
        findMany: vi.fn(async () => [] as unknown[]),
      },
      user: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          status: "active",
        })),
        findMany: vi.fn(async () => [
          { id: USER_ID, name: "tecnico", full_name: "Técnico" },
          { id: OTHER_USER_ID, name: "ana", full_name: "Ana" },
        ]),
      },
    };
    const db = {
      ...models,
      // O bloqueio consultivo enfileira as transações da mesma chave, e a transação que
      // falha tem as escritas desfeitas, como o rollback do banco.
      $transaction: vi.fn(async (callback: (database: TiDatabase) => Promise<unknown>) => {
        const releases: Array<() => void> = [];
        const undo: Array<() => void> = [];
        const eventsBefore = events.length;
        try {
          return await callback({
            ...models,
            inventoryTecnologia: {
              ...models.inventoryTecnologia,
              updateMany: async (args: { where: Record<string, unknown>; data: object }) => {
                for (const item of assets.filter((candidate) => matches(candidate, args.where))) {
                  const before = { ...item };
                  undo.push(() => Object.assign(item, before));
                }
                return models.inventoryTecnologia.updateMany(args);
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
          } as unknown as TiDatabase);
        } catch (error) {
          for (const revert of undo.reverse()) revert();
          events.length = eventsBefore;
          throw error;
        } finally {
          for (const release of releases) release();
        }
      }),
    } as unknown as TiDatabase;
    return { db, models, assets, events, lockedKeys, changes };
  }

  it("move entre pessoas e locais e registra origem, destino, autor e ação", async () => {
    const { db, assets, events } = store([asset("monitor-1", { user_id: USER_ID })]);
    const service = createTiDomainServices(db).inventory;

    await service?.transfer?.(auth(), "monitor-1", { user_id: OTHER_USER_ID });
    expect(assets[0]).toMatchObject({ user_id: OTHER_USER_ID, location_id: null });
    await service?.transfer?.(auth(), "monitor-1", { location_id: ROOM_A });
    expect(assets[0]).toMatchObject({ user_id: null, location_id: ROOM_A, return_date: null });
    await service?.transfer?.(auth(), "monitor-1", { location_id: ROOM_B });
    await service?.transfer?.(auth(), "monitor-1", { user_id: USER_ID });
    expect(assets[0]).toMatchObject({ user_id: USER_ID, location_id: null, return_date: null });

    expect(events).toEqual([
      event({ from_user_id: USER_ID, to_user_id: OTHER_USER_ID }),
      event({ from_user_id: OTHER_USER_ID, to_location_id: ROOM_A }),
      event({ from_location_id: ROOM_A, to_location_id: ROOM_B }),
      event({ from_location_id: ROOM_B, to_user_id: USER_ID }),
    ]);
  });

  it("atribuição e devolução também registram evento", async () => {
    const { db, events } = store([asset("monitor-1", { location_id: ROOM_A })]);
    const service = createTiDomainServices(db).inventory;

    await service?.assignUser?.(auth(), "monitor-1", { user_id: OTHER_USER_ID });
    await service?.returnAsset?.(auth(), "monitor-1", {});

    expect(events).toEqual([
      event({
        action: "assign",
        from_location_id: ROOM_A,
        to_user_id: OTHER_USER_ID,
        to_location_id: ROOM_A,
      }),
      event({
        action: "return",
        from_user_id: OTHER_USER_ID,
        from_location_id: ROOM_A,
        to_location_id: ROOM_A,
      }),
    ]);
  });

  it("edição de pessoa ou local entra no histórico e atribuir a quem já tem o item é recusado", async () => {
    const { db, events } = store([asset("monitor-1", { user_id: USER_ID, location_id: ROOM_A })]);
    (db as unknown as { inventoryTecnologia: Record<string, unknown> }).inventoryTecnologia.update =
      vi.fn(async ({ data }: { data: object }) => data);
    const service = createTiDomainServices(db).inventory;

    await service?.update?.(auth(), "monitor-1", { user_id: OTHER_USER_ID });
    // Edição que não muda pessoa nem local não gera evento.
    await service?.update?.(auth(), "monitor-1", { notes: "Revisado", location_id: ROOM_A });
    await expect(
      service?.assignUser?.(auth(), "monitor-1", { user_id: OTHER_USER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, message: "O item já está com esta pessoa." });

    expect(events).toEqual([
      event({
        from_user_id: USER_ID,
        from_location_id: ROOM_A,
        to_user_id: OTHER_USER_ID,
        to_location_id: ROOM_A,
      }),
    ]);
  });

  // O formulário reenvia a pessoa: num item legado já devolvido isso não pode reatribuí-lo.
  it("não reatribui item devolvido ao editar e recusa devolver o que não está com ninguém", async () => {
    const returnedAt = new Date("2024-01-10");
    const { db, assets, events } = store([
      asset("antigo", { user_id: USER_ID, return_date: returnedAt }),
      asset("livre"),
    ]);
    (db as unknown as { inventoryTecnologia: Record<string, unknown> }).inventoryTecnologia.update =
      vi.fn(async ({ data }: { data: object }) => data);
    const service = createTiDomainServices(db).inventory;

    await service?.update?.(auth(), "antigo", { notes: "Revisado", user_id: USER_ID });
    expect(assets[0]).toMatchObject({ user_id: USER_ID, return_date: returnedAt });

    for (const id of ["antigo", "livre"]) {
      await expect(service?.returnAsset?.(auth(), id, {})).rejects.toMatchObject({
        statusCode: 409,
        message: "O item não está com ninguém para ser devolvido.",
      });
    }
    expect(events).toEqual([]);
  });

  it("edição e transferência simultâneas do mesmo item não se sobrepõem", async () => {
    const { db, assets, events } = store([asset("monitor-1", { user_id: USER_ID })]);
    const service = createTiDomainServices(db).inventory;

    const results = await Promise.allSettled([
      service?.update?.(auth(), "monitor-1", { location_id: ROOM_B }),
      service?.transfer?.(auth(), "monitor-1", { user_id: OTHER_USER_ID }),
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

  it("recusa destino igual à origem, item de outra organização e segundo computador", async () => {
    const { db, events } = store([
      asset("monitor-1", { user_id: USER_ID }),
      asset("monitor-2", { location_id: ROOM_A }),
      asset("alheio", { organization_id: "outra-organizacao" }),
      asset("pc-1", { user_id: USER_ID, category_id: COMPUTER_CATEGORY_ID }),
      asset("pc-2", { location_id: ROOM_A, category_id: COMPUTER_CATEGORY_ID }),
    ]);
    const service = createTiDomainServices(db).inventory;

    await expect(
      service?.transfer?.(auth(), "monitor-1", { user_id: USER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, message: "O item já está com esta pessoa." });
    await expect(
      service?.transfer?.(auth(), "monitor-2", { location_id: ROOM_A }),
    ).rejects.toMatchObject({ statusCode: 409, message: "O item já está neste local." });
    await expect(service?.transfer?.(auth(), "alheio", { user_id: USER_ID })).rejects.toMatchObject(
      { statusCode: 404 },
    );
    await expect(service?.listHistory?.(auth(), "alheio", {})).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service?.transfer?.(auth(), "pc-2", { user_id: USER_ID })).rejects.toMatchObject({
      statusCode: 409,
      message: "Esse usuário já possui um computador ativo.",
    });
    expect(events).toEqual([]);
  });

  it("transferências simultâneas do mesmo item não se sobrepõem", async () => {
    const { db, events } = store([asset("monitor-1", { user_id: USER_ID })]);
    const service = createTiDomainServices(db).inventory;

    const results = await Promise.allSettled([
      service?.transfer?.(auth(), "monitor-1", { user_id: OTHER_USER_ID }),
      service?.transfer?.(auth(), "monitor-1", { location_id: ROOM_A }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results.flatMap((result) => (result.status === "rejected" ? [result.reason.statusCode] : [])),
    ).toEqual([409]);
    expect(events).toHaveLength(1);
  });

  // #1933: troca entre pessoas e lote, numa operação que vale para todos ou nenhum.
  describe("troca e lote", () => {
    const THIRD_USER_ID = "b0000000-0000-4000-8000-000000000003";
    const computer = (id: string, overrides: Record<string, unknown> = {}) =>
      asset(id, { asset_code: id, category_id: COMPUTER_CATEGORY_ID, ...overrides });
    const monitor = (id: string, overrides: Record<string, unknown> = {}) =>
      asset(id, { asset_code: id, ...overrides });
    const holders = (assets: Asset[]) =>
      Object.fromEntries(assets.map((item) => [item.id, item.user_id ?? item.location_id]));

    it("transfere vários itens para uma pessoa ou um local, com um evento por item", async () => {
      const { db, assets, events } = store([
        monitor("monitor-1", { user_id: USER_ID }),
        monitor("monitor-2", { location_id: ROOM_A }),
        computer("pc-1", { user_id: USER_ID }),
      ]);
      const service = createTiDomainServices(db).inventory;

      await service?.transferBatch?.(auth(), {
        asset_ids: ["monitor-1", "monitor-2", "pc-1"],
        user_id: OTHER_USER_ID,
      });
      expect(holders(assets)).toEqual({
        "monitor-1": OTHER_USER_ID,
        "monitor-2": OTHER_USER_ID,
        "pc-1": OTHER_USER_ID,
      });
      expect(events).toEqual([
        event({ from_user_id: USER_ID, to_user_id: OTHER_USER_ID }),
        event({ inventory_id: "monitor-2", from_location_id: ROOM_A, to_user_id: OTHER_USER_ID }),
        event({ inventory_id: "pc-1", from_user_id: USER_ID, to_user_id: OTHER_USER_ID }),
      ]);

      await service?.transferBatch?.(auth(), {
        asset_ids: ["monitor-1", "pc-1"],
        location_id: ROOM_B,
      });
      expect(assets.filter((item) => item.location_id === ROOM_B).map((item) => item.id)).toEqual([
        "monitor-1",
        "pc-1",
      ]);
      expect(events).toHaveLength(5);
    });

    it("um item impeditivo desfaz o lote e a mensagem diz quais são", async () => {
      const seed = [
        monitor("monitor-1", { user_id: USER_ID }),
        computer("pc-1", { user_id: USER_ID }),
        computer("pc-2", { location_id: ROOM_A }),
        monitor("ja-la", { user_id: OTHER_USER_ID }),
      ];
      const { db, assets, events } = store(seed);
      const service = createTiDomainServices(db).inventory;

      await expect(
        service?.transferBatch?.(auth(), {
          asset_ids: ["monitor-1", "pc-1", "pc-2", "ja-la"],
          user_id: OTHER_USER_ID,
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

    it("troca os computadores de duas pessoas e recusa as trocas inválidas", async () => {
      const { db, assets, events, lockedKeys } = store([
        computer("pc-1", { user_id: USER_ID, location_id: ROOM_A }),
        computer("pc-2", { user_id: OTHER_USER_ID }),
        monitor("monitor-1", { user_id: USER_ID }),
        monitor("sem-dono", { location_id: ROOM_A }),
        computer("pc-3", { user_id: THIRD_USER_ID }),
        monitor("monitor-3", { user_id: THIRD_USER_ID }),
      ]);
      const service = createTiDomainServices(db).inventory;

      await service?.swap?.(auth(), { asset_id: "pc-1", other_asset_id: "pc-2" });
      expect(holders(assets)).toMatchObject({ "pc-1": OTHER_USER_ID, "pc-2": USER_ID });
      expect(events).toEqual([
        event({
          inventory_id: "pc-1",
          action: "swap",
          from_user_id: USER_ID,
          from_location_id: ROOM_A,
          to_user_id: OTHER_USER_ID,
        }),
        event({
          inventory_id: "pc-2",
          action: "swap",
          from_user_id: OTHER_USER_ID,
          to_user_id: USER_ID,
        }),
      ]);
      // Os bloqueios das duas pessoas são tomados em ordem.
      expect(lockedKeys).toEqual([...lockedKeys].sort());
      expect(lockedKeys).toHaveLength(2);

      const before = holders(assets);
      // Quem recebe o pc-2 já tem o pc-3, que não entra na troca.
      await expect(
        service?.swap?.(auth(), { asset_id: "pc-2", other_asset_id: "monitor-3" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TI_INVENTORY_ITEMS_BLOCKED" });
      await expect(
        service?.swap?.(auth(), { asset_id: "pc-2", other_asset_id: "sem-dono" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "A troca exige dois itens que estejam com pessoas.",
      });
      await expect(
        service?.swap?.(auth(), { asset_id: "pc-2", other_asset_id: "monitor-1" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Os dois itens já estão com a mesma pessoa.",
      });
      expect(holders(assets)).toEqual(before);
      expect(events).toHaveLength(2);
    });

    it("lotes simultâneos para a mesma pessoa deixam um só computador ativo", async () => {
      const { db, assets, lockedKeys } = store([
        computer("pc-1", { location_id: ROOM_A }),
        computer("pc-2", { location_id: ROOM_A }),
      ]);
      const service = createTiDomainServices(db).inventory;

      const results = await Promise.allSettled([
        service?.transferBatch?.(auth(), { asset_ids: ["pc-1"], user_id: OTHER_USER_ID }),
        service?.transferBatch?.(auth(), { asset_ids: ["pc-2"], user_id: OTHER_USER_ID }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(assets.filter((item) => item.user_id === OTHER_USER_ID)).toHaveLength(1);
      expect(new Set(lockedKeys)).toEqual(
        new Set([`ti.inventory.active-computer:${ORGANIZATION_ID}:${OTHER_USER_ID}`]),
      );
    });

    it("recusa a troca com uma pessoa inativa", async () => {
      const { db, models, assets, events } = store([
        computer("pc-1", { user_id: USER_ID }),
        computer("pc-2", { user_id: OTHER_USER_ID }),
      ]);
      // O ex-colaborador ainda aparece no item, mas não está ativo na organização.
      models.user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === OTHER_USER_ID ? (null as never) : { id: where.id, status: "active" },
      );

      await expect(
        createTiDomainServices(db).inventory?.swap?.(auth(), {
          asset_id: "pc-1",
          other_asset_id: "pc-2",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(holders(assets)).toEqual({ "pc-1": USER_ID, "pc-2": OTHER_USER_ID });
      expect(events).toEqual([]);
    });

    it("não movimenta item de outra organização e desfaz o lote em falha no meio", async () => {
      const { db, models, assets, events } = store([
        monitor("monitor-1", { user_id: USER_ID }),
        monitor("monitor-2", { user_id: USER_ID }),
        monitor("alheio", { user_id: OTHER_USER_ID, organization_id: "outra-organizacao" }),
      ]);
      const service = createTiDomainServices(db).inventory;

      await expect(
        service?.transferBatch?.(auth(), {
          asset_ids: ["monitor-1", "alheio"],
          user_id: THIRD_USER_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service?.swap?.(auth(), { asset_id: "monitor-1", other_asset_id: "alheio" }),
      ).rejects.toMatchObject({ statusCode: 404 });

      // Outra operação move o segundo item depois que o lote já gravou o primeiro.
      const writeAsset = models.inventoryTecnologia.updateMany.getMockImplementation();
      models.inventoryTecnologia.updateMany.mockImplementationOnce(async (args) => {
        const written = await writeAsset?.(args);
        const second = assets.find((item) => item.id === "monitor-2");
        if (second) second.user_id = THIRD_USER_ID;
        return written ?? { count: 0 };
      });
      await expect(
        service?.transferBatch?.(auth(), {
          asset_ids: ["monitor-1", "monitor-2"],
          user_id: OTHER_USER_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "Nenhum item foi movimentado. Itens impeditivos: monitor-2 (movimentado por outra operação).",
      });
      expect(assets.find((item) => item.id === "monitor-1")).toMatchObject({ user_id: USER_ID });
      expect(events).toEqual([]);
    });
  });

  it("lista o histórico do item com nomes, só da organização", async () => {
    const { db, models } = store([asset("monitor-1")]);
    const createdAt = new Date("2026-10-13T12:00:00.000Z");
    models.inventoryEventTecnologia.findMany.mockResolvedValue([
      {
        id: "event-1",
        inventory_id: "monitor-1",
        action: "transfer",
        created_at: createdAt,
        actor_user_id: USER_ID,
        from_user_id: OTHER_USER_ID,
        from_location_id: null,
        to_user_id: null,
        to_location_id: ROOM_A,
      },
    ]);

    const history = await createTiDomainServices(db).inventory?.listHistory?.(auth(), "monitor-1", {
      page: 2,
      page_size: 10,
    });

    expect(history).toEqual([
      {
        id: "event-1",
        inventory_id: "monitor-1",
        action: "transfer",
        created_at: createdAt,
        actor: { id: USER_ID, name: "tecnico", full_name: "Técnico" },
        from_user: { id: OTHER_USER_ID, name: "ana", full_name: "Ana" },
        to_user: null,
        from_location: null,
        to_location: { id: ROOM_A, name: "Sala A" },
      },
    ]);
    expect(models.inventoryEventTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID, inventory_id: "monitor-1" },
      orderBy: { created_at: "desc" },
      skip: 10,
      take: 10,
    });
    expect(models.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [USER_ID, OTHER_USER_ID] }, organization_id: ORGANIZATION_ID },
      }),
    );
    expect(models.inventoryLocationTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [ROOM_A] }, organization_id: ORGANIZATION_ID },
      }),
    );
  });
});

// #1934: mapa de equipamentos por usuário, somente leitura e derivado só do inventário.
describe("TI domain: mapa de equipamentos do usuário", () => {
  // Só os dois models que o mapa pode consultar: qualquer outro acesso (por exemplo o mapa de
  // grupos de clientes do Regularize, `tb_workspace.mapas` no legado) quebraria o teste.
  const dbWith = (assets: unknown[], user: unknown = { id: OTHER_USER_ID, name: "ana" }) => {
    const models = {
      user: { findFirst: vi.fn(async () => user) },
      inventoryTecnologia: { findMany: vi.fn(async () => assets) },
    };
    return { db: models as unknown as TiDatabase, models };
  };

  it("monta o mapa com dados e conexões, só dos itens ativos da pessoa na organização", async () => {
    const { db, models } = dbWith([
      {
        id: "pc-1",
        asset_code: "PC-001",
        notes: "Marca: Dell\nEntradas: HDMI, VGA\nConfigurações: i5, 8GB",
        category: { name: "Computador" },
      },
      { id: "fone-1", asset_code: "FONE-1", notes: "Saída: P2", category: { name: "Fone" } },
      {
        id: "mon-1",
        asset_code: "MON-001",
        notes: "Entradas: HDMI",
        category: { name: "Monitor" },
      },
    ]);

    const map = await createTiDomainServices(db).inventory?.getUserEquipmentMap?.(
      auth(),
      OTHER_USER_ID,
    );

    expect(map).toMatchObject({
      user: { id: OTHER_USER_ID, name: "ana" },
      equipment: [
        {
          id: "pc-1",
          asset_code: "PC-001",
          category: "Computador",
          is_host: true,
          brand: "Dell",
          inputs: ["HDMI", "VGA"],
          configuration: ["i5", "8GB"],
        },
        { id: "fone-1", is_host: false, outputs: ["P2"] },
        { id: "mon-1", is_host: false, inputs: ["HDMI"] },
      ],
      // O fone não tem porta em comum com o computador: fica sem conexão.
      connections: [{ host_id: "pc-1", equipment_id: "mon-1", ports: ["HDMI"] }],
    });
    expect(models.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, user_id: OTHER_USER_ID, return_date: null },
      }),
    );
    expect(models.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_USER_ID, organization_id: ORGANIZATION_ID } }),
    );
  });

  it("não inventa conexão e recusa usuário de outra organização", async () => {
    const ambiguous = dbWith([
      { id: "pc-1", asset_code: "PC-001", notes: null, category: { name: "Computador" } },
      {
        id: "mon-1",
        asset_code: "MON-001",
        notes: "ligado no HDMI do computador",
        category: { name: "Monitor" },
      },
    ]);
    expect(
      await createTiDomainServices(ambiguous.db).inventory?.getUserEquipmentMap?.(
        auth(),
        OTHER_USER_ID,
      ),
    ).toMatchObject({ equipment: [{ id: "pc-1" }, { id: "mon-1" }], connections: [] });

    const foreign = dbWith([], null);
    await expect(
      createTiDomainServices(foreign.db).inventory?.getUserEquipmentMap?.(auth(), OTHER_USER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(foreign.models.inventoryTecnologia.findMany).not.toHaveBeenCalled();
  });
});

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

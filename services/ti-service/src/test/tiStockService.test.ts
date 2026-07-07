import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiDepartmentResolverService } from "../services/tiDepartmentResolverService.js";
import { TiStockService } from "../services/tiStockService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 3,
};

const departmentId = "50000000-0000-4000-8000-000000000001";
const categoryId = "60000000-0000-4000-8000-000000000001";
const locationId = "70000000-0000-4000-8000-000000000001";
const stockId = "80000000-0000-4000-8000-000000000001";

describe("TiDepartmentResolverService", () => {
  it("throws 404 when Tecnologia department does not exist", async () => {
    const prisma = {
      department: { findFirst: vi.fn(async () => null) },
    };
    const resolver = new TiDepartmentResolverService(prisma as never);

    await expect(resolver.resolveTechnologyDepartmentId("org-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("TiStockService", () => {
  it("creates a stock item in the Tecnologia department", async () => {
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      categoryStock: { findFirst: vi.fn(async () => ({ id: categoryId, status: true })) },
      locationStock: { findFirst: vi.fn(async () => ({ id: locationId, status: true })) },
      stock: {
        create: vi.fn(async ({ data }) => ({ id: stockId, ...data })),
      },
    };
    const service = new TiStockService(prisma as never);

    const result = await service.createItem(context, {
      name: "Notebook",
      category_id: categoryId,
      location_id: locationId,
      quantity: 3,
      description: "Notebook de uso interno.",
    });

    expect(result).toMatchObject({
      id: stockId,
      name: "Notebook",
      department_id: departmentId,
      organization_id: context.organizationId,
      quantity: 3,
    });
  });

  it("creates an entry and increments stock quantity", async () => {
    const tx = {
      stock: {
        findFirst: vi.fn(async () => ({ id: stockId, quantity: 2 })),
        update: vi.fn(async ({ data }) => ({
          id: stockId,
          quantity: 2 + data.quantity.increment,
        })),
      },
      entryStock: {
        create: vi.fn(async ({ data }) => ({ id: "entry-1", ...data })),
      },
    };
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const service = new TiStockService(prisma as never);

    const result = await service.createEntry(context, stockId, { quantity: 4 });

    expect(result).toMatchObject({ id: stockId, quantity: 6 });
    expect(tx.entryStock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stock_id: stockId,
        quantity: 4,
        entry_by_user_id: context.userId,
        organization_id: context.organizationId,
      }),
    });
  });

  it("rejects exits when stock balance is insufficient", async () => {
    const tx = {
      stock: {
        findFirst: vi.fn(async () => ({ id: stockId, quantity: 2 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      user: {
        findFirst: vi.fn(async () => ({ id: context.userId })),
      },
    };
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const service = new TiStockService(prisma as never);

    await expect(
      service.createExit(context, stockId, {
        quantity: 3,
        requester_id: context.userId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Saldo insuficiente no estoque de TI.",
    });
    expect(tx.stock.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: stockId,
        organization_id: context.organizationId,
        department_id: departmentId,
        quantity: { gte: 3 },
      }),
      data: { quantity: { decrement: 3 } },
    });
  });
});

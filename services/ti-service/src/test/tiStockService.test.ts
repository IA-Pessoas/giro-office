import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiDepartmentResolverService } from "../services/tiDepartmentResolverService.js";
import { TiStockService } from "../services/tiStockService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 2,
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
  it("filters the full stock result before pagination and returns page metadata", async () => {
    const item = {
      id: stockId,
      name: "Mouse sem fio",
      category_id: categoryId,
      location_id: locationId,
      status: true,
      location: { id: locationId, name: "Almoxarifado TI" },
    };
    const count = vi.fn(async () => 3);
    const findMany = vi.fn(async () => [item]);
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      stock: { count, findMany },
    };
    const service = new TiStockService(prisma as never);

    const result = await service.listItems(context, {
      name: "Mouse",
      category_id: categoryId,
      location_id: locationId,
      status: true,
      page: 2,
      page_size: 1,
    });
    const where = {
      organization_id: context.organizationId,
      department_id: departmentId,
      category_id: categoryId,
      location_id: locationId,
      name: { contains: "Mouse", mode: "insensitive" },
      status: true,
    };

    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith({
      where,
      include: {
        category: true,
        location: true,
        department: true,
      },
      orderBy: { name: "asc" },
      skip: 1,
      take: 1,
    });
    expect(result).toEqual({
      data: [item],
      total: 3,
      page: 2,
      limit: 1,
      hasMore: true,
    });
  });

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

  it("rejects an active stock location with the same normalized name", async () => {
    const locationStock = {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [{ id: locationId, name: "Almoxarifado São", status: true }]),
      create: vi.fn(async ({ data }) => ({ id: "location-2", ...data })),
    };
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      locationStock,
    };
    const service = new TiStockService(prisma as never);

    await expect(
      service.createLocation(context, { name: "  ALMOXARIFADO   SAO  " }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Ja existe um local de estoque de TI ativo com este nome.",
    });
    expect(locationStock.create).not.toHaveBeenCalled();
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

  it("lists stock entries and exits as a consolidated movement timeline", async () => {
    const requesterId = "00000000-0000-4000-8000-000000000101";
    const approverId = "00000000-0000-4000-8000-000000000102";
    const operatorId = "00000000-0000-4000-8000-000000000103";
    const destinationLocationId = "70000000-0000-4000-8000-000000000099";
    const entryDate = new Date("2026-07-13T12:00:00.000Z");
    const exitDate = new Date("2026-07-13T13:30:00.000Z");
    const prisma = {
      department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
      stock: {
        findFirst: vi.fn(async () => ({
          id: stockId,
          quantity: 7,
          department_id: departmentId,
          organization_id: context.organizationId,
        })),
      },
      entryStock: {
        findMany: vi.fn(async () => [
          {
            id: "entry-1",
            stock_id: stockId,
            quantity: 4,
            entry_date: entryDate,
            entry_by_user_id: operatorId,
            entry_by_user: { id: operatorId, name: "Operador Entrada" },
          },
        ]),
      },
      exitStock: {
        findMany: vi.fn(async () => [
          {
            id: "exit-1",
            stock_id: stockId,
            quantity: 2,
            destination: "Mesa comercial",
            exit_date: exitDate,
            requester_id: requesterId,
            approver_id: approverId,
            operator_id: operatorId,
            location_destination_id: destinationLocationId,
            requester: { id: requesterId, name: "Solicitante TI" },
            approver: { id: approverId, name: "Aprovador TI" },
            operator: { id: operatorId, name: "Operador Saida" },
            loc_dest: { id: destinationLocationId, name: "Sala Comercial" },
          },
        ]),
      },
    };
    const service = new TiStockService(prisma as never);

    const result = await service.listItemMovements(context, stockId);

    expect(result).toEqual([
      {
        id: "exit-1",
        type: "exit",
        quantity: 2,
        created_at: "2026-07-13T13:30:00.000Z",
        item_id: stockId,
        requester_id: requesterId,
        requester_name: "Solicitante TI",
        approver_id: approverId,
        approver_name: "Aprovador TI",
        operator_id: operatorId,
        operator_name: "Operador Saida",
        destination: "Mesa comercial",
        location_destination_id: destinationLocationId,
        location_destination_name: "Sala Comercial",
        balance_before: null,
        balance_after: null,
      },
      {
        id: "entry-1",
        type: "entry",
        quantity: 4,
        created_at: "2026-07-13T12:00:00.000Z",
        item_id: stockId,
        requester_id: null,
        requester_name: null,
        approver_id: null,
        approver_name: null,
        operator_id: operatorId,
        operator_name: "Operador Entrada",
        destination: null,
        location_destination_id: null,
        location_destination_name: null,
        balance_before: null,
        balance_after: null,
      },
    ]);
    expect(prisma.stock.findFirst).toHaveBeenCalledWith({
      where: {
        id: stockId,
        organization_id: context.organizationId,
        department_id: departmentId,
      },
      select: { id: true },
    });
    expect(prisma.entryStock.findMany).toHaveBeenCalledWith({
      where: { stock_id: stockId, organization_id: context.organizationId },
      select: {
        id: true,
        stock_id: true,
        quantity: true,
        entry_date: true,
        entry_by_user_id: true,
        entry_by_user: { select: { name: true } },
      },
    });
    expect(prisma.exitStock.findMany).toHaveBeenCalledWith({
      where: { stock_id: stockId, organization_id: context.organizationId },
      select: {
        id: true,
        stock_id: true,
        quantity: true,
        destination: true,
        exit_date: true,
        requester_id: true,
        approver_id: true,
        operator_id: true,
        location_destination_id: true,
        requester: { select: { name: true } },
        approver: { select: { name: true } },
        operator: { select: { name: true } },
        loc_dest: { select: { name: true } },
      },
    });
  });
});

import {
  MAX_REPORTING_QUERY_BYTES,
  MAX_REPORTING_QUERY_LIMIT,
  MAX_REPORTING_QUERY_ROWS,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";
import { TiInventoryReportingService } from "../reporting/tiInventoryReportingService.js";

describe("TiInventoryReportingService", () => {
  it("publica somente os campos e chaves governados do inventário", () => {
    const service = new TiInventoryReportingService({ inventoryTecnologia: {} } as never);

    expect(service.catalog.sources).toEqual([
      expect.objectContaining({
        key: "ti.inventory",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "asset_code" }),
          expect.objectContaining({ key: "category" }),
          expect.objectContaining({ key: "location" }),
          expect.objectContaining({ key: "delivery_date" }),
          expect.objectContaining({ key: "return_date" }),
          expect.objectContaining({ key: "notes" }),
        ]),
        keys: expect.arrayContaining([
          expect.objectContaining({ key: "user_id" }),
          expect.objectContaining({ key: "location_id" }),
          expect.objectContaining({ key: "category_id" }),
          expect.objectContaining({ key: "responsible_it_staff_id" }),
        ]),
      }),
    ]);

    const fields = service.catalog.sources[0]?.fields.map((field) => field.key) ?? [];
    expect(fields).not.toContain("id");
    expect(fields).not.toContain("organization_id");
    expect(fields).not.toContain("user_id");
    expect(fields).not.toContain("responsible_it_staff_id");
  });

  it("filtra por organização, projeta os campos publicados e sinaliza o limite da origem", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "never-returned",
        asset_code: "NB-001",
        category: { id: "never-returned", name: "Notebook" },
        location: { id: "never-returned", name: "Matriz" },
        notes: "Uso administrativo",
      },
      {
        asset_code: "NB-002",
        category: { name: "Notebook" },
        location: null,
        notes: null,
      },
    ]);
    const service = new TiInventoryReportingService({ inventoryTecnologia: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.inventory",
        fields: ["asset_code", "category", "location", "notes"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          asset_code: "NB-001",
          category: "Notebook",
          location: "Matriz",
          notes: "Uso administrativo",
        },
      ],
      reachedLimit: true,
      nextCursor: "never-returned",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: {
        asset_code: true,
        category: { select: { name: true } },
        location: { select: { name: true } },
        notes: true,
        id: true,
      },
      orderBy: { id: "asc" },
      take: 2,
    });
  });

  it("recusa projeções fora do catálogo antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new TiInventoryReportingService({ inventoryTecnologia: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.inventory",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });

  describe("InternalReportingService", () => {
    it.each([
      100, 101, 102,
    ])("extrai todos os %i registros em páginas por cursor, sem expor IDs internos", async (rowCount) => {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        id: `asset-${String(index).padStart(3, "0")}`,
        asset_code: `NB-${String(index).padStart(3, "0")}`,
      }));
      const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
      const findMany = vi.fn(async ({ cursor, skip = 0, take }) => {
        const start = cursor ? (rowIndexes.get(cursor.id) ?? -1) + skip : 0;
        return rows.slice(start, start + take);
      });
      const transaction = {
        department: { findFirst: vi.fn() },
        extensionsTecnologia: { findMany: vi.fn() },
        inventoryTecnologia: { findMany },
        tIRequest: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
      };
      const prisma = {
        ...transaction,
        $transaction: vi.fn(async (read) => read(transaction)),
      };
      const service = new InternalReportingService(prisma as never);

      const result = await service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.inventory",
        fields: ["asset_code"],
        limit: rowCount,
      });
      expect(result).toEqual({
        rows: rows.map(({ asset_code }) => ({ asset_code })),
        reachedLimit: false,
      });

      expect(findMany).toHaveBeenCalledTimes(rowCount > 100 ? 2 : 1);
      expect(findMany.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          where: { organization_id: "10000000-0000-4000-8000-000000000001" },
          select: { id: true, asset_code: true },
          orderBy: { id: "asc" },
          take: 101,
        }),
      );
      if (rowCount > 100) {
        expect(findMany.mock.calls[1]?.[0]).toEqual(
          expect.objectContaining({
            cursor: { id: "asset-099" },
            skip: 1,
            orderBy: { id: "asc" },
          }),
        );
      }
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "RepeatableRead",
        maxWait: 5_000,
        timeout: 30_000,
      });
      expect(result.rows.every((row) => !("id" in row))).toBe(true);
    });

    it.each([
      { source: "ti.extensions", field: "number", delegate: "extensionsTecnologia" },
      { source: "ti.requests", field: "title", delegate: "tIRequest" },
      { source: "ti.stock", field: "name", delegate: "stock" },
    ] as const)("continua $source pela chave id sem repetir páginas", async (caseInfo) => {
      const rowCount = 102;
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        id: `row-${String(index).padStart(3, "0")}`,
        [caseInfo.field]: `value-${index}`,
      }));
      const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
      const findMany = vi.fn(
        async (query: { cursor?: { id: string }; skip?: number; take: number }) => {
          const start = query.cursor
            ? (rowIndexes.get(query.cursor.id) ?? -1) + (query.skip ?? 0)
            : 0;
          return rows.slice(start, start + query.take);
        },
      );
      const transaction = {
        department: { findFirst: vi.fn().mockResolvedValue({ id: "department-ti" }) },
        extensionsTecnologia: { findMany: vi.fn() },
        inventoryTecnologia: { findMany: vi.fn() },
        tIRequest: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
      };
      Object.assign(transaction[caseInfo.delegate], { findMany });
      const prisma = {
        ...transaction,
        $transaction: vi.fn(async (read: (transaction: typeof transaction) => unknown) =>
          read(transaction),
        ),
      };
      const service = new InternalReportingService(prisma as never);

      const result = await service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: caseInfo.source,
        fields: [caseInfo.field],
        limit: rowCount,
      });

      expect(result).toEqual({
        rows: rows.map((row) => ({ [caseInfo.field]: row[caseInfo.field] })),
        reachedLimit: false,
      });
      expect(result.rows.every((row) => !("id" in row))).toBe(true);
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(findMany.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({ cursor: { id: "row-099" }, skip: 1, orderBy: { id: "asc" } }),
      );
      if (caseInfo.source === "ti.stock") {
        expect(transaction.department.findFirst).toHaveBeenCalledTimes(1);
      }
    });

    it("recusa um snapshot que excede o limite global de bytes", async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([{ id: "asset-001", notes: "x".repeat(MAX_REPORTING_QUERY_BYTES) }]);
      const service = new InternalReportingService({
        department: { findFirst: vi.fn() },
        extensionsTecnologia: { findMany: vi.fn() },
        inventoryTecnologia: { findMany },
        tIRequest: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
      } as never);

      await expect(
        service.extract({
          organizationId: "10000000-0000-4000-8000-000000000001",
          source: "ti.inventory",
          fields: ["notes"],
          limit: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_BYTE_LIMIT_CODE });
    });

    it("recusa acima do limite global de linhas sem devolver resultado parcial", async () => {
      const rows = Array.from({ length: MAX_REPORTING_QUERY_ROWS + 1 }, (_, index) => ({
        id: `asset-${String(index).padStart(5, "0")}`,
        asset_code: `NB-${index}`,
      }));
      const rowIndexes = new Map(rows.map((row, index) => [row.id, index]));
      const findMany = vi.fn(
        async (query: { cursor?: { id: string }; skip?: number; take: number }) => {
          const start = query.cursor
            ? (rowIndexes.get(query.cursor.id) ?? -1) + (query.skip ?? 0)
            : 0;
          return rows.slice(start, start + query.take);
        },
      );
      const transaction = {
        department: { findFirst: vi.fn() },
        extensionsTecnologia: { findMany: vi.fn() },
        inventoryTecnologia: { findMany },
        tIRequest: { findMany: vi.fn() },
        stock: { findMany: vi.fn() },
      };
      const prisma = {
        ...transaction,
        $transaction: vi.fn(async (read: (client: unknown) => unknown) => read(transaction)),
      };
      const service = new InternalReportingService(prisma as never);

      await expect(
        service.extract({
          organizationId: "10000000-0000-4000-8000-000000000001",
          source: "ti.inventory",
          fields: ["asset_code"],
          limit: MAX_REPORTING_QUERY_LIMIT,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_ROW_LIMIT_CODE });
      expect(findMany).toHaveBeenCalledTimes(501);
    });
  });
});

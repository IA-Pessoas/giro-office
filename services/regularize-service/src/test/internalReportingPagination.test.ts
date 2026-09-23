import {
  MAX_REPORTING_QUERY_LIMIT,
  MAX_REPORTING_QUERY_ROWS,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import {
  RegularizeLicenseReportingService,
  RegularizeMunicipalTaxesReportingService,
} from "../reporting/internalReportingService.js";

const cases = [
  { source: "regularize.licenses", field: "has", delegate: "license" },
  { source: "regularize.processes", field: "status", delegate: "process" },
  { source: "regularize.municipal_taxes", field: "year", delegate: "municipalTaxes" },
] as const;

describe("Regularize reporting pagination", () => {
  it.each(cases)("extracts $source through stable id cursors at 100/101/102 rows", async (item) => {
    for (const rowCount of [100, 101, 102]) {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        id: `${item.field}-${String(index).padStart(3, "0")}`,
        [item.field]: item.field === "has" ? index % 2 === 0 : index,
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
        license: { findMany: vi.fn() },
        process: { findMany: vi.fn() },
        municipalTaxes: { findMany: vi.fn() },
      };
      Object.assign(transaction[item.delegate], { findMany });
      const prisma = {
        ...transaction,
        $transaction: vi.fn(async (read: (tx: typeof transaction) => unknown) => read(transaction)),
      };
      const service =
        item.delegate === "municipalTaxes"
          ? new RegularizeMunicipalTaxesReportingService(prisma as never)
          : new RegularizeLicenseReportingService(prisma as never);

      const result = await service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: item.source,
        fields: [item.field],
        limit: rowCount,
      });

      expect(result).toEqual({
        rows: rows.map(({ [item.field]: value }) => ({ [item.field]: value })),
        reachedLimit: false,
      });
      expect(findMany).toHaveBeenCalledTimes(rowCount > 100 ? 2 : 1);
      expect(findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { organization_id: "10000000-0000-4000-8000-000000000001" },
        select: { id: true, [item.field]: true },
        orderBy: { id: "asc" },
        take: 101,
      });
      if (rowCount > 100) {
        expect(findMany.mock.calls[1]?.[0]).toMatchObject({
          cursor: { id: `${item.field}-099` },
          skip: 1,
          orderBy: { id: "asc" },
        });
      }
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "RepeatableRead",
        maxWait: 5_000,
        timeout: 30_000,
      });
      expect(result.rows.every((row) => !("id" in row))).toBe(true);
    }
  });

  it.each(cases)("filters $source across pages before applying the output limit", async (item) => {
    const matches = (index: number): unknown => {
      if (item.field === "has") return index >= 120;
      if (item.field === "status") return index >= 120 ? "ok" : "old";
      return index >= 120 ? 2026 : 2025;
    };
    const expected = matches(120);
    const rows = Array.from({ length: 150 }, (_, index) => ({
      id: `${item.field}-${String(index).padStart(3, "0")}`,
      [item.field]: matches(index),
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
      license: { findMany: vi.fn() },
      process: { findMany: vi.fn() },
      municipalTaxes: { findMany: vi.fn() },
    };
    Object.assign(transaction[item.delegate], { findMany });
    const prisma = {
      ...transaction,
      $transaction: vi.fn(async (read: (tx: typeof transaction) => unknown) => read(transaction)),
    };
    const service =
      item.delegate === "municipalTaxes"
        ? new RegularizeMunicipalTaxesReportingService(prisma as never)
        : new RegularizeLicenseReportingService(prisma as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: item.source,
        fields: [item.field],
        query: {
          filters: [{ field: item.field, operator: "eq", parameter: "match", value: expected }],
        },
        limit: 101,
      } as never),
    ).resolves.toMatchObject({
      rows: Array.from({ length: 30 }, () => ({ [item.field]: expected })),
      reachedLimit: false,
    });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: `${item.field}-099` },
      skip: 1,
      orderBy: { id: "asc" },
    });
  });

  it("rejects snapshots above the shared global row and byte limits", async () => {
    const tooManyRows = Array.from({ length: MAX_REPORTING_QUERY_ROWS + 1 }, (_, index) => ({
      id: `license-${String(index).padStart(5, "0")}`,
      has: true,
    }));
    const rowIndexes = new Map(tooManyRows.map((row, index) => [row.id, index]));
    const findMany = vi.fn(
      async (query: { cursor?: { id: string }; skip?: number; take: number }) => {
        const start = query.cursor
          ? (rowIndexes.get(query.cursor.id) ?? -1) + (query.skip ?? 0)
          : 0;
        return tooManyRows.slice(start, start + query.take);
      },
    );
    const transaction = { license: { findMany }, process: { findMany: vi.fn() } };
    const prisma = {
      ...transaction,
      $transaction: vi.fn(async (read: (tx: typeof transaction) => unknown) => read(transaction)),
    };
    const service = new RegularizeLicenseReportingService(prisma as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.licenses",
        fields: ["has"],
        limit: MAX_REPORTING_QUERY_LIMIT,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_ROW_LIMIT_CODE });

    const largeValue = "x".repeat(20 * 1024 * 1024);
    const byteTransaction = {
      license: {
        findMany: vi.fn().mockResolvedValue([{ id: "license-00001", protocol: largeValue }]),
      },
      process: { findMany: vi.fn() },
    };
    const byteLimited = new RegularizeLicenseReportingService({
      ...byteTransaction,
      $transaction: vi.fn(async (read: (tx: typeof byteTransaction) => unknown) =>
        read(byteTransaction),
      ),
    } as never);
    await expect(
      byteLimited.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.licenses",
        fields: ["protocol"],
        query: {
          filters: [{ field: "protocol", operator: "contains", parameter: "p", value: "x" }],
        },
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_BYTE_LIMIT_CODE });
  });
});

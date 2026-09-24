import {
  MAX_REPORTING_QUERY_LIMIT,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
  REPORTING_QUERY_ROW_LIMIT_MESSAGE,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { InternalReportingService } from "../reporting/internalReportingService.js";
import { internalReportingExtractBodySchema } from "../schemas/internalReporting.schemas.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

type FindManyInput = {
  where: { organization_id: string };
  select: Record<string, unknown>;
  take: number;
  cursor?: { id: string };
  skip?: number;
};

function delegateFor(rows: readonly Record<string, unknown>[]) {
  return {
    findMany: vi.fn(async (input: FindManyInput) => {
      const cursorIndex = input.cursor ? rows.findIndex((row) => row.id === input.cursor?.id) : -1;
      const start = cursorIndex >= 0 ? cursorIndex + (input.skip ?? 0) : (input.skip ?? 0);
      return rows
        .slice(start, start + input.take)
        .map((row) =>
          Object.fromEntries(Object.keys(input.select).map((field) => [field, row[field]])),
        );
    }),
  };
}

function createPrisma(source: string, rows: readonly Record<string, unknown>[]) {
  const empty = delegateFor([]);
  const selected = delegateFor(rows);
  const prisma: Record<string, unknown> = {
    rhRequest: source === "rh.requests" ? selected : empty,
    holidays: source === "rh.holidays" ? selected : empty,
    point: source === "rh.attendance" ? selected : empty,
    timeSheets: empty,
    timeBankReleases: empty,
    timeClockRequest: empty,
  };
  prisma.$transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) => read(prisma));
  return { prisma, selected, transaction: prisma.$transaction as ReturnType<typeof vi.fn> };
}

function sourceRows(source: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = `row-${String(index).padStart(4, "0")}`;
    if (source === "rh.requests") return { id, title: `Request ${index}` };
    if (source === "rh.holidays") return { id, name: `Holiday ${index}`, date: new Date() };
    return { id, clock_in: new Date(2026, 0, 1, 0, index), clock_out: null };
  });
}

describe("extração incremental de relatórios RH", () => {
  it.each([
    "rh.attendance",
    "rh.holidays",
    "rh.requests",
  ])("%s lê integralmente 100, 101 e 102 registros", async (source) => {
    for (const count of [100, 101, 102]) {
      const { prisma, selected, transaction } = createPrisma(source, sourceRows(source, count));
      const fields =
        source === "rh.requests" ? ["title"] : source === "rh.holidays" ? ["name"] : ["status"];

      const result = await new InternalReportingService(prisma as never).extract({
        organizationId,
        source: source as "rh.attendance" | "rh.holidays" | "rh.requests",
        fields,
        limit: 150,
      });

      expect(result.rows).toHaveLength(count);
      expect(result.reachedLimit).toBe(false);
      expect(transaction).toHaveBeenCalledOnce();
      expect(selected.findMany.mock.calls.some(([input]) => input.cursor?.id === "row-0099")).toBe(
        count > 100,
      );
      expect(
        selected.findMany.mock.calls.every(
          ([input]) => input.where.organization_id === organizationId,
        ),
      ).toBe(true);
      expect(
        selected.findMany.mock.calls.every(
          ([input]) => input.skip === (input.cursor ? 1 : undefined),
        ),
      ).toBe(true);
    }
  });

  it("continua attendance entre os quatro agregados sem repetir linhas", async () => {
    const makeRows = (prefix: string, count: number, row: Record<string, unknown>) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${String(index).padStart(3, "0")}`,
        ...row,
      }));
    const prisma: Record<string, unknown> = {
      point: delegateFor(makeRows("point", 70, { clock_in: new Date(), clock_out: null })),
      timeSheets: delegateFor(makeRows("sheet", 70, { status: "Assinada", totals: {} })),
      timeBankReleases: delegateFor(makeRows("release", 70, { is_approved: true, minutes: 5 })),
      timeClockRequest: delegateFor(makeRows("request", 70, { status: "Pendente" })),
    };
    prisma.$transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) =>
      read(prisma),
    );

    const result = await new InternalReportingService(prisma as never).extract({
      organizationId,
      source: "rh.attendance",
      fields: ["status"],
      limit: 250,
    });

    expect(result.rows).toHaveLength(250);
    expect(result.reachedLimit).toBe(true);
    expect(result.rows.slice(0, 70).every((row) => row.status === "Em andamento")).toBe(true);
    expect(result.rows.slice(70, 140).every((row) => row.status === "Assinada")).toBe(true);
    expect(result.rows.slice(140, 210).every((row) => row.status === "Aprovado")).toBe(true);
    const sheets = prisma.timeSheets as ReturnType<typeof delegateFor>;
    expect(sheets.findMany.mock.calls.some(([input]) => input.cursor?.id === "sheet-029")).toBe(
      true,
    );
  });

  it("avança para o próximo agregado quando a página termina exatamente na fronteira", async () => {
    const makeRows = (prefix: string, count: number, row: Record<string, unknown>) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${String(index).padStart(3, "0")}`,
        ...row,
      }));
    const points = delegateFor(makeRows("point", 100, { clock_in: new Date(), clock_out: null }));
    const sheets = delegateFor(makeRows("sheet", 1, { status: "Assinada", totals: {} }));
    const prisma: Record<string, unknown> = {
      point: points,
      timeSheets: sheets,
      timeBankReleases: delegateFor([]),
      timeClockRequest: delegateFor([]),
    };
    prisma.$transaction = vi.fn(async (read: (client: unknown) => Promise<unknown>) =>
      read(prisma),
    );

    const result = await new InternalReportingService(prisma as never).extract({
      organizationId,
      source: "rh.attendance",
      fields: ["status"],
      limit: 101,
    });

    expect(result.rows).toHaveLength(101);
    expect(result.rows.slice(0, 100).every((row) => row.status === "Em andamento")).toBe(true);
    expect(result.rows[100]?.status).toBe("Assinada");
    expect(result.reachedLimit).toBe(false);
    expect(points.findMany).toHaveBeenCalledOnce();
    expect(sheets.findMany).toHaveBeenCalledOnce();
  });

  it("aceita o limite global e rejeita valores acima dele no contrato interno", () => {
    const base = { source: "rh.holidays", fields: ["name"] };
    expect(
      internalReportingExtractBodySchema.safeParse({ ...base, limit: MAX_REPORTING_QUERY_LIMIT })
        .success,
    ).toBe(true);
    expect(
      internalReportingExtractBodySchema.safeParse({
        ...base,
        limit: MAX_REPORTING_QUERY_LIMIT + 1,
      }).success,
    ).toBe(false);
  });

  it("interrompe extração direta acima do limite global de bytes com erro acionável", async () => {
    const oversized = "x".repeat(11 * 1024 * 1024);
    const { prisma } = createPrisma("rh.holidays", [
      { id: "holiday-1", name: oversized, date: new Date() },
      { id: "holiday-2", name: oversized, date: new Date() },
    ]);

    await expect(
      new InternalReportingService(prisma as never).extract({
        organizationId,
        source: "rh.holidays",
        fields: ["name"],
        limit: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: REPORTING_QUERY_BYTE_LIMIT_CODE });
  });

  it("rejeita o excedente do limite global de linhas sem devolver resultado parcial", async () => {
    const { prisma } = createPrisma("rh.requests", sourceRows("rh.requests", 50_001));

    await expect(
      new InternalReportingService(prisma as never).extract({
        organizationId,
        source: "rh.requests",
        fields: ["title"],
        limit: MAX_REPORTING_QUERY_LIMIT,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: REPORTING_QUERY_ROW_LIMIT_CODE,
      message: REPORTING_QUERY_ROW_LIMIT_MESSAGE,
    });
  });
});

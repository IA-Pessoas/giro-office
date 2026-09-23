import "./envBootstrap.js";

import { Buffer } from "node:buffer";
import {
  MAX_REPORTING_QUERY_BYTES,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("fiscal internal reporting service", () => {
  it.each([
    100, 101, 102,
  ])("extrai %i linhas fiscais sem truncar no limite legado", async (count) => {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: `fiscal-${String(index + 1).padStart(4, "0")}`,
      state: "SP",
    }));
    const icms = {
      findMany: vi
        .fn()
        .mockImplementation(async (input: { cursor?: { id: string }; take: number }) => {
          const start = input.cursor ? Number(input.cursor.id.split("-")[1]) : 0;
          return rows.slice(start, start + input.take);
        }),
    };
    const prisma: Record<string, unknown> = { icms, ncm: { findMany: vi.fn() } };
    prisma.$transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) => read(prisma),
    );
    const service = new InternalReportingService(prisma as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["state"],
        limit: count,
      }),
    ).resolves.toEqual({
      rows: Array.from({ length: count }, () => ({ state: "SP" })),
      reachedLimit: false,
    });
  });

  it("recusa resultado acima do limite global de bytes com erro acionável", async () => {
    const icms = {
      findMany: vi.fn().mockResolvedValue([{ description: "x".repeat(MAX_REPORTING_QUERY_BYTES) }]),
    };
    const service = new InternalReportingService({ icms, ncm: { findMany: vi.fn() } } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["description"],
        limit: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: REPORTING_QUERY_BYTE_LIMIT_CODE,
      message: REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
    });
  });

  it("aplica o limite global de bytes ao acumular várias páginas fiscais", async () => {
    const description = "x".repeat(105_000);
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `fiscal-${String(index + 1).padStart(4, "0")}`,
      description,
    }));
    const secondPage = Array.from({ length: 100 }, (_, index) => ({
      id: `fiscal-${String(index + 101).padStart(4, "0")}`,
      description,
    }));
    const singlePageBytes = Buffer.byteLength(
      JSON.stringify(firstPage.map(({ description: value }) => ({ description: value }))),
      "utf8",
    );
    expect(singlePageBytes).toBeLessThan(MAX_REPORTING_QUERY_BYTES);
    expect(singlePageBytes * 2).toBeGreaterThan(MAX_REPORTING_QUERY_BYTES);
    const icms = {
      findMany: vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage),
    };
    const prisma: Record<string, unknown> = {
      icms,
      ncm: { findMany: vi.fn() },
      ipi: { findMany: vi.fn() },
    };
    prisma.$transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) => read(prisma),
    );
    const service = new InternalReportingService(prisma as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["description"],
        limit: 2_000,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: REPORTING_QUERY_BYTE_LIMIT_CODE,
      message: REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
    });
    expect(icms.findMany).toHaveBeenCalledTimes(2);
  });

  it("extrai ICMS somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const icms = {
      findMany: vi.fn().mockResolvedValue([
        { state: "SP", description: "Substituição tributária" },
        { state: "RJ", description: "Operação interna" },
      ]),
    };
    const service = new InternalReportingService({ icms, ncm: { findMany: vi.fn() } } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["state", "description"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ state: "SP", description: "Substituição tributária" }],
      reachedLimit: true,
    });
    expect(icms.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, description: true },
      take: 2,
    });
  });

  it("extrai NCM somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const ncm = {
      findMany: vi.fn().mockResolvedValue([
        { ncm_code: "84719012", description: "Unidade" },
        { ncm_code: "84713012", description: "Portátil" },
      ]),
    };
    const service = new InternalReportingService({ icms: { findMany: vi.fn() }, ncm } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ncm",
        fields: ["ncm_code", "description"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ ncm_code: "84719012", description: "Unidade" }],
      reachedLimit: true,
    });
    expect(ncm.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { ncm_code: true, description: true },
      take: 2,
    });
  });

  it("extrai IPI pela fonte correspondente", async () => {
    const ipi = {
      findMany: vi.fn().mockResolvedValue([{ ncm: "84719012" }]),
    };
    const service = new InternalReportingService({
      icms: { findMany: vi.fn() },
      ncm: { findMany: vi.fn() },
      ipi,
    } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ipi",
        fields: ["ncm"],
        limit: 1,
      }),
    ).resolves.toEqual({ rows: [{ ncm: "84719012" }], reachedLimit: false });
    expect(ipi.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { ncm: true },
      take: 2,
    });
  });

  it("lê fontes acima do limite legado em páginas chaveadas dentro do mesmo snapshot", async () => {
    const allRows = Array.from({ length: 1_123 }, (_, index) => ({
      id: `fiscal-${String(index + 1).padStart(4, "0")}`,
      state: index < 1_000 ? "SP" : "RJ",
    }));
    const firstPage = allRows.slice(0, 100);
    const icms = {
      findMany: vi
        .fn()
        .mockImplementation(async (input: { cursor?: { id: string }; take: number }) => {
          const start = input.cursor ? Number(input.cursor.id.split("-")[1]) : 0;
          return allRows.slice(start, start + input.take);
        }),
    };
    const prisma: Record<string, unknown> = {
      icms,
      ncm: { findMany: vi.fn() },
      ipi: { findMany: vi.fn() },
    };
    const transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) => read(prisma),
    );
    prisma.$transaction = transaction;
    const service = new InternalReportingService(prisma as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["state"],
        limit: 50_001,
      }),
    ).resolves.toEqual({
      rows: [
        ...Array.from({ length: 1_000 }, () => ({ state: "SP" })),
        ...Array.from({ length: 123 }, () => ({ state: "RJ" })),
      ],
      reachedLimit: false,
    });

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
    expect(icms.findMany).toHaveBeenNthCalledWith(1, {
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, id: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    expect(icms.findMany).toHaveBeenNthCalledWith(2, {
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, id: true },
      cursor: { id: firstPage[99]?.id },
      skip: 1,
      orderBy: { id: "asc" },
      take: 100,
    });
  });

  it("continua critérios com cursor sem expor o ID interno", async () => {
    const firstPage = Array.from({ length: 101 }, (_, index) => ({
      id: `fiscal-${String(index + 1).padStart(3, "0")}`,
      state: "SP",
    }));
    const lastPage = [{ id: "fiscal-102", state: "RJ" }];
    const icms = {
      findMany: vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(lastPage),
    };
    const prisma: Record<string, unknown> = {
      icms,
      ncm: { findMany: vi.fn() },
      ipi: { findMany: vi.fn() },
    };
    const transaction = vi.fn(
      async (read: (client: unknown) => Promise<unknown>, _options: unknown) => read(prisma),
    );
    prisma.$transaction = transaction;
    const service = new InternalReportingService(prisma as never);

    await expect(
      service.extract({
        query: {},
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["state"],
        limit: 200,
      }),
    ).resolves.toEqual({
      rows: [...Array.from({ length: 100 }, () => ({ state: "SP" })), { state: "RJ" }],
      reachedLimit: false,
    });

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
    expect(icms.findMany).toHaveBeenNthCalledWith(1, {
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, id: true },
      orderBy: { id: "asc" },
      take: 101,
    });
    expect(icms.findMany).toHaveBeenNthCalledWith(2, {
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, id: true },
      cursor: { id: firstPage[99]?.id },
      skip: 1,
      orderBy: { id: "asc" },
      take: 101,
    });
  });

  it("recusa ID e campos não publicados sem consultar o banco", async () => {
    const icms = { findMany: vi.fn() };
    const ncm = { findMany: vi.fn() };
    const service = new InternalReportingService({ icms, ncm } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ncm",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(icms.findMany).not.toHaveBeenCalled();
    expect(ncm.findMany).not.toHaveBeenCalled();
  });
});

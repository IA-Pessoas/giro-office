import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

describe("InternalReportingService attendance", () => {
  it("consome cada grant uma única vez no armazenamento persistente", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn().mockResolvedValue({});
    const service = new InternalReportingService({
      reportGrantUse: { deleteMany, create },
    });

    await expect(service.consumeGrant("grant-851", 2_000_000_000)).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expires_at: { lte: expect.any(Date) } },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        grant_hash: expect.any(String),
        expires_at: new Date(2_000_000_000 * 1000),
      },
    });

    create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "P2002" }));
    await expect(service.consumeGrant("grant-851", 2_000_000_000)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("consulta presenca nos quatro agregados com a organizacao e remove dados sensiveis", async () => {
    const prisma = {
      point: {
        findMany: vi.fn().mockResolvedValue([
          {
            clock_in: new Date("2026-05-01T08:00:00.000Z"),
            lunch_out: new Date("2026-05-01T12:00:00.000Z"),
            lunch_in: new Date("2026-05-01T13:00:00.000Z"),
            clock_out: new Date("2026-05-01T17:00:00.000Z"),
            workload_hours: 480,
            time_bank_balance: 15,
          },
        ]),
      },
      timeSheets: {
        findMany: vi.fn().mockResolvedValue([
          {
            start_time: new Date("2026-05-01T00:00:00.000Z"),
            end_time: new Date("2026-05-31T23:59:59.000Z"),
            status: "Assinada",
            totals: { worked_minutes: 480, expected_minutes: 480, balance_minutes: 0 },
          },
        ]),
      },
      timeBankReleases: {
        findMany: vi.fn().mockResolvedValue([
          {
            date: new Date("2026-05-02T00:00:00.000Z"),
            minutes: 30,
            is_approved: true,
          },
        ]),
      },
      timeClockRequest: {
        findMany: vi.fn().mockResolvedValue([
          {
            date: new Date("2026-05-03T00:00:00.000Z"),
            clock_in: new Date("2026-05-03T08:00:00.000Z"),
            lunch_out: null,
            lunch_in: null,
            clock_out: null,
            status: "Pendente",
            justification: "nao publicar",
            attachment: "nao publicar",
          },
        ]),
      },
    };

    const result = await new InternalReportingService(prisma).extract({
      organizationId: "10000000-0000-0000-0000-000000000001",
      source: "rh.attendance",
      fields: [
        "date",
        "clock_in",
        "workload_hours",
        "worked_minutes",
        "balance_minutes",
        "minutes",
        "is_approved",
        "status",
      ],
      limit: 10,
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        date: new Date("2026-05-01T08:00:00.000Z"),
        clock_in: new Date("2026-05-01T08:00:00.000Z"),
        workload_hours: 480,
        status: "Completo",
      }),
      expect.objectContaining({
        date: new Date("2026-05-01T00:00:00.000Z"),
        worked_minutes: 480,
        balance_minutes: 0,
        status: "Assinada",
      }),
      expect.objectContaining({
        date: new Date("2026-05-02T00:00:00.000Z"),
        minutes: 30,
        is_approved: true,
      }),
      expect.objectContaining({
        date: new Date("2026-05-03T00:00:00.000Z"),
        status: "Pendente",
      }),
    ]);
    expect(JSON.stringify(result.rows)).not.toContain("nao publicar");
    for (const delegate of [
      prisma.point.findMany,
      prisma.timeSheets.findMany,
      prisma.timeBankReleases.findMany,
      prisma.timeClockRequest.findMany,
    ]) {
      expect(delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization_id: "10000000-0000-0000-0000-000000000001" },
          orderBy: { id: "asc" },
          take: expect.any(Number),
        }),
      );
    }
  });

  it("rejeita campo que nao pertence ao catalogo", async () => {
    const prisma = {
      point: { findMany: vi.fn() },
      timeSheets: { findMany: vi.fn() },
      timeBankReleases: { findMany: vi.fn() },
      timeClockRequest: { findMany: vi.fn() },
    };

    await expect(
      new InternalReportingService(prisma).extract({
        organizationId: "10000000-0000-0000-0000-000000000001",
        source: "rh.attendance",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.point.findMany).not.toHaveBeenCalled();
  });
});

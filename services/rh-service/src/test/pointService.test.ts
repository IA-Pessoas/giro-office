import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, envMock } = vi.hoisted(() => ({
  prismaMock: {
    point: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    pointsConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    holidays: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    timeSheets: {
      findFirst: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    timeClockRequest: {
      count: vi.fn(),
    },
  },
  envMock: { pointMinIntervalMinutes: 30 },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));
vi.mock("../config/env.js", () => ({ getRhEnv: () => envMock }));

import { PointService } from "../services/pointService.js";

describe("PointService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registerPoint lanca 400 quando user_id e obrigatorio", async () => {
    const service = new PointService();
    await expect(
      service.registerPoint({ user_id: "", organization_id: "org-1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("registerPoint bloqueia dia coberto por folha assinada", async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ timezone: "UTC" });
    prismaMock.point.findFirst.mockResolvedValue(null);
    prismaMock.timeSheets.findFirst.mockResolvedValue({ id: "sheet-1" });

    const service = new PointService();
    await expect(
      service.registerPoint({ user_id: "user-1", organization_id: "org-1" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.point.create).not.toHaveBeenCalled();
  });

  it("calculateDailyHours lanca 404 quando ponto nao existe", async () => {
    prismaMock.point.findUnique.mockResolvedValue(null);
    const service = new PointService();
    await expect(service.calculateDailyHours("point-1", "org-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("calculateDailyHours soma os dois intervalos em minutos e calcula o saldo do dia", async () => {
    prismaMock.point.findUnique.mockResolvedValue({
      id: "point-1",
      user_id: "user-1",
      organization_id: "org-1",
      clock_in: new Date("2026-05-04T06:00:00.000Z"),
      lunch_out: new Date("2026-05-04T09:00:00.000Z"),
      lunch_in: new Date("2026-05-04T10:00:00.000Z"),
      clock_out: new Date("2026-05-04T15:00:00.000Z"),
      time_bank_balance: null,
    });
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      organization_id: "org-1",
      start_time: new Date("2026-05-04T06:00:00.000Z"),
      lunch_break: new Date("2026-05-04T09:00:00.000Z"),
      lunch_return: new Date("2026-05-04T10:00:00.000Z"),
      end_time: new Date("2026-05-04T15:00:00.000Z"),
      work_days: "1,2,3,4,5",
    });
    prismaMock.holidays.findFirst.mockResolvedValue(null);

    const service = new PointService();
    const result = await service.calculateDailyHours("point-1", "org-1");

    expect(result).toEqual({
      point_id: "point-1",
      total_worked_minutes: 480,
      expected_minutes: 480,
      day_balance_minutes: 0,
    });
    expect(prismaMock.point.update).toHaveBeenCalledWith({
      where: { id: "point-1" },
      data: { workload_hours: 480, time_bank_balance: 0 },
    });
  });

  it("calculateDailyHours procura o feriado pelo dia civil gravado a meia-noite UTC", async () => {
    prismaMock.point.findUnique.mockResolvedValue({
      id: "point-1",
      user_id: "user-1",
      organization_id: "org-1",
      clock_in: new Date("2026-04-21T12:00:00.000Z"),
      lunch_out: new Date("2026-04-21T13:00:00.000Z"),
      lunch_in: new Date("2026-04-21T14:00:00.000Z"),
      clock_out: new Date("2026-04-21T16:00:00.000Z"),
      time_bank_balance: null,
    });
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      organization_id: "org-1",
      start_time: new Date("2026-04-21T11:00:00.000Z"),
      lunch_break: new Date("2026-04-21T15:00:00.000Z"),
      lunch_return: new Date("2026-04-21T16:00:00.000Z"),
      end_time: new Date("2026-04-21T20:00:00.000Z"),
      work_days: "1,2,3,4,5",
    });
    prismaMock.holidays.findFirst.mockResolvedValue({ id: "tiradentes" });
    const result = await new PointService().calculateDailyHours(
      "point-1",
      "org-1",
      prismaMock as never,
      "America/Sao_Paulo",
    );

    expect(prismaMock.holidays.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          date: {
            gte: new Date("2026-04-21T00:00:00.000Z"),
            lte: new Date("2026-04-21T23:59:59.999Z"),
          },
        },
      }),
    );
    expect(result.expected_minutes).toBe(0);
  });

  it("listPoints aplica filtro por periodo e usuario", async () => {
    prismaMock.point.findMany.mockResolvedValue([
      {
        id: "point-1",
        user_id: "user-1",
        organization_id: "org-1",
        clock_in: new Date("2026-05-02T08:00:00.000Z"),
        lunch_out: null,
        lunch_in: null,
        clock_out: null,
        workload_hours: null,
        time_bank_balance: null,
        signature: null,
      },
    ]);

    const service = new PointService();
    const result = await service.listPoints("org-1", {
      user_id: "user-1",
      date_from: new Date("2026-05-01T00:00:00.000Z"),
      date_to: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(prismaMock.point.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          user_id: "user-1",
          clock_in: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
    expect(result[0]?.status).toBe("Em andamento");
  });

  it("getTodayPointForUser retorna proxima acao Entrada quando nao ha ponto", async () => {
    prismaMock.point.findFirst.mockResolvedValue(null);

    const service = new PointService();
    const result = await service.getTodayPointForUser({
      user_id: "user-1",
      organization_id: "org-1",
    });

    expect(result).toMatchObject({
      point: null,
      next_action: "Entrada",
      is_complete: false,
      has_clock_in: false,
    });
  });

  it("getTodayPointForUser retorna proxima acao Volta almoco para ponto parcial", async () => {
    prismaMock.point.findFirst.mockResolvedValue({
      id: "point-1",
      user_id: "user-1",
      organization_id: "org-1",
      clock_in: new Date("2026-05-02T08:00:00.000Z"),
      lunch_out: new Date("2026-05-02T12:00:00.000Z"),
      lunch_in: null,
      clock_out: null,
      workload_hours: null,
      time_bank_balance: null,
      signature: null,
    });

    const service = new PointService();
    const result = await service.getTodayPointForUser({
      user_id: "user-1",
      organization_id: "org-1",
    });

    expect(result).toMatchObject({
      next_action: "Volta almoço",
      has_clock_in: true,
      has_lunch_out: true,
      has_lunch_in: false,
      has_clock_out: false,
    });
  });

  it("getMonthlySummary calcula totais, saldo e pendencias", async () => {
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("2026-05-01T08:00:00.000Z"),
      lunch_break: new Date("2026-05-01T12:00:00.000Z"),
      lunch_return: new Date("2026-05-01T13:00:00.000Z"),
      end_time: new Date("2026-05-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
    });
    prismaMock.point.findMany.mockResolvedValue([
      {
        id: "point-1",
        user_id: "user-1",
        organization_id: "org-1",
        clock_in: new Date("2026-05-04T08:00:00.000Z"),
        lunch_out: new Date("2026-05-04T12:00:00.000Z"),
        lunch_in: new Date("2026-05-04T13:00:00.000Z"),
        clock_out: new Date("2026-05-04T18:00:00.000Z"),
        workload_hours: 540,
        time_bank_balance: 60,
        signature: null,
      },
      {
        id: "point-2",
        user_id: "user-1",
        organization_id: "org-1",
        clock_in: new Date("2026-05-05T08:00:00.000Z"),
        lunch_out: new Date("2026-05-05T12:00:00.000Z"),
        lunch_in: new Date("2026-05-05T13:00:00.000Z"),
        clock_out: new Date("2026-05-05T17:00:00.000Z"),
        workload_hours: 480,
        time_bank_balance: 0,
        signature: null,
      },
    ]);
    prismaMock.holidays.findMany.mockResolvedValue([]);
    prismaMock.timeClockRequest.count.mockResolvedValue(3);

    const service = new PointService();
    const result = await service.getMonthlySummary({
      user_id: "user-1",
      organization_id: "org-1",
      month: "2026-05",
    });

    expect(result.total_worked_minutes).toBe(1020);
    expect(result.expected_minutes).toBe(21 * 480);
    expect(result.balance_minutes).toBe(1020 - 21 * 480);
    expect(result.overtime_minutes).toBe(0);
    expect(result.pending_adjustments).toBe(3);
  });

  it("getMonthlySummary conta ausencia ignorando feriado e dia nao util", async () => {
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("2026-06-01T08:00:00.000Z"),
      lunch_break: new Date("2026-06-01T12:00:00.000Z"),
      lunch_return: new Date("2026-06-01T13:00:00.000Z"),
      end_time: new Date("2026-06-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
    });
    prismaMock.point.findMany.mockResolvedValue([
      {
        id: "point-1",
        user_id: "user-1",
        organization_id: "org-1",
        clock_in: new Date("2026-06-01T08:00:00.000Z"),
        lunch_out: new Date("2026-06-01T12:00:00.000Z"),
        lunch_in: new Date("2026-06-01T13:00:00.000Z"),
        clock_out: new Date("2026-06-01T17:00:00.000Z"),
        workload_hours: 480,
        time_bank_balance: 0,
        signature: null,
      },
    ]);
    prismaMock.holidays.findMany.mockResolvedValue([
      { date: new Date("2026-06-04T00:00:00.000Z") },
    ]);
    prismaMock.timeClockRequest.count.mockResolvedValue(0);

    const service = new PointService();
    const result = await service.getMonthlySummary({
      user_id: "user-1",
      organization_id: "org-1",
      month: "2026-06",
    });

    expect(result.absence_days).toBe(20);
  });

  it("getMonthlySummary lanca 400 quando month invalido", async () => {
    const service = new PointService();
    await expect(
      service.getMonthlySummary({
        user_id: "user-1",
        organization_id: "org-1",
        month: "2026-13",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

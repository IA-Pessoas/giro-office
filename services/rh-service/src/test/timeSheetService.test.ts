import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    timeSheets: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    pointsConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    point: {
      findMany: vi.fn(),
    },
    holidays: {
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    timeClockRequest: {
      findFirst: vi.fn(),
    },
    timeBankReleases: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { TimeSheetService } from "../services/timeSheetService.js";

describe("TimeSheetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findUnique.mockResolvedValue({ timezone: "UTC" });
    prismaMock.point.findMany.mockResolvedValue([]);
    prismaMock.holidays.findMany.mockResolvedValue([]);
    prismaMock.timeClockRequest.findFirst.mockResolvedValue(null);
    prismaMock.timeBankReleases.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
  });

  it("create lanca 400 quando end_time nao e posterior ao start_time", async () => {
    const service = new TimeSheetService();
    const start = new Date("2025-01-01T10:00:00.000Z");
    await expect(
      service.create({
        organization_id: "org-1",
        user_id: "user-1",
        start_time: start,
        end_time: start,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("sign lanca 404 quando folha nao existe", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    const service = new TimeSheetService();
    await expect(
      service.sign({
        organization_id: "org-1",
        timesheet_id: "sheet-1",
        signer_user_id: "user-1",
        signature: "assinatura",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create gera e persiste snapshot detalhado da folha", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("1970-01-01T08:00:00.000Z"),
      lunch_break: new Date("1970-01-01T12:00:00.000Z"),
      lunch_return: new Date("1970-01-01T13:00:00.000Z"),
      end_time: new Date("1970-01-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
      bank_balance: 0,
      signature: null,
    });
    prismaMock.point.findMany.mockResolvedValue([
      {
        id: "point-1",
        user_id: "user-1",
        organization_id: "org-1",
        clock_in: new Date("2026-05-18T08:00:00.000Z"),
        lunch_out: new Date("2026-05-18T12:00:00.000Z"),
        lunch_in: new Date("2026-05-18T13:00:00.000Z"),
        clock_out: new Date("2026-05-18T17:30:00.000Z"),
        workload_hours: 510,
        time_bank_balance: 30,
        signature: null,
      },
    ]);
    prismaMock.holidays.findMany.mockResolvedValue([]);
    prismaMock.timeSheets.create.mockImplementation(async ({ data }) => ({
      id: "sheet-1",
      ...data,
      signature: null,
    }));

    const service = new TimeSheetService();
    const result = await service.create({
      organization_id: "org-1",
      user_id: "user-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
    });

    expect(prismaMock.timeSheets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "Gerada",
          days: [
            expect.objectContaining({
              date: "2026-05-18",
              worked_minutes: 510,
              expected_minutes: 480,
              balance_minutes: 30,
              status: "Completo",
            }),
          ],
          totals: expect.objectContaining({
            worked_minutes: 510,
            expected_minutes: 480,
            balance_minutes: 30,
            absence_count: 0,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "Gerada",
      totals: { worked_minutes: 510, balance_minutes: 30 },
    });
  });

  it("getById retorna folha detalhada da organizacao", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue({
      id: "sheet-1",
      user_id: "user-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
      signature: null,
      organization_id: "org-1",
      status: "Gerada",
      days: [],
      totals: { worked_minutes: 0, expected_minutes: 0, balance_minutes: 0, absence_count: 0 },
    });

    const service = new TimeSheetService();
    await expect(
      service.getById({ organization_id: "org-1", timesheet_id: "sheet-1" }),
    ).resolves.toMatchObject({
      id: "sheet-1",
      status: "Gerada",
      days: [],
      totals: { absence_count: 0 },
    });
  });

  it("list retorna resumo leve com totais persistidos", async () => {
    prismaMock.timeSheets.findMany.mockResolvedValue([
      {
        id: "sheet-1",
        user_id: "user-1",
        start_time: new Date("2026-05-18T00:00:00.000Z"),
        end_time: new Date("2026-05-18T23:59:59.999Z"),
        signature: "assinatura",
        organization_id: "org-1",
        status: "Assinada",
        days: [{ date: "2026-05-18" }],
        totals: {
          worked_minutes: 510,
          expected_minutes: 480,
          balance_minutes: 30,
          absence_count: 0,
        },
      },
    ]);

    const service = new TimeSheetService();
    await expect(service.list({ organization_id: "org-1", user_id: "user-1" })).resolves.toEqual([
      expect.objectContaining({
        id: "sheet-1",
        status: "Assinada",
        has_details: true,
        worked_minutes: 510,
        balance_minutes: 30,
      }),
    ]);
  });

  it("sign atualiza assinatura e status para Assinada", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue({
      id: "sheet-1",
      user_id: "user-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
      signature: null,
      organization_id: "org-1",
      status: "Gerada",
      days: [],
      totals: { worked_minutes: 0, expected_minutes: 0, balance_minutes: 0, absence_count: 0 },
    });
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      organization_id: "org-1",
      start_time: new Date("1970-01-01T08:00:00.000Z"),
      lunch_break: new Date("1970-01-01T12:00:00.000Z"),
      lunch_return: new Date("1970-01-01T13:00:00.000Z"),
      end_time: new Date("1970-01-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
      bank_balance: 0,
      signature: null,
    });
    prismaMock.timeSheets.update.mockResolvedValue({
      id: "sheet-1",
      user_id: "user-1",
      signature: "assinatura",
      organization_id: "org-1",
      status: "Assinada",
    });

    const service = new TimeSheetService();
    await service.sign({
      organization_id: "org-1",
      timesheet_id: "sheet-1",
      signer_user_id: "user-1",
      signature: "assinatura",
    });

    expect(prismaMock.timeSheets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signature: "assinatura", status: "Assinada" }),
      }),
    );
  });

  it("create usa o periodo padrao do dia 22 anterior ao dia 22 atual", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("1970-01-01T08:00:00.000Z"),
      lunch_break: new Date("1970-01-01T12:00:00.000Z"),
      lunch_return: new Date("1970-01-01T13:00:00.000Z"),
      end_time: new Date("1970-01-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
      bank_balance: 0,
      signature: null,
    });
    prismaMock.timeSheets.create.mockImplementation(async ({ data }) => ({
      id: "sheet-default",
      ...data,
      signature: null,
    }));

    await new TimeSheetService().create({
      organization_id: "org-1",
      user_id: "user-1",
      now: new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(prismaMock.timeSheets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          start_time: new Date("2026-04-22T00:00:00.000Z"),
          end_time: new Date("2026-05-22T23:59:59.999Z"),
        }),
      }),
    );
  });

  it("rebuild atualiza uma folha aberta e rejeita folha assinada", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue({
      id: "sheet-1",
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
      signature: null,
      status: "Gerada",
      days: [],
      totals: null,
    });
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("1970-01-01T08:00:00.000Z"),
      lunch_break: new Date("1970-01-01T12:00:00.000Z"),
      lunch_return: new Date("1970-01-01T13:00:00.000Z"),
      end_time: new Date("1970-01-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
      bank_balance: 10,
      signature: null,
    });
    prismaMock.timeSheets.update.mockResolvedValue({ id: "sheet-1", status: "Gerada" });

    await expect(
      new TimeSheetService().rebuild({ organization_id: "org-1", timesheet_id: "sheet-1" }),
    ).resolves.toMatchObject({ id: "sheet-1" });

    prismaMock.timeSheets.findFirst.mockResolvedValueOnce({
      id: "sheet-2",
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
      signature: "assinatura",
      status: "Assinada",
      days: [],
      totals: null,
    });
    await expect(
      new TimeSheetService().rebuild({ organization_id: "org-1", timesheet_id: "sheet-2" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("sign bloqueia fechamento quando ha ajuste pendente e aprova banco uma vez", async () => {
    prismaMock.timeSheets.findFirst.mockResolvedValue({
      id: "sheet-1",
      user_id: "user-1",
      organization_id: "org-1",
      start_time: new Date("2026-05-18T00:00:00.000Z"),
      end_time: new Date("2026-05-18T23:59:59.999Z"),
      signature: null,
      status: "Gerada",
      days: [],
      totals: null,
    });
    prismaMock.timeClockRequest.findFirst.mockResolvedValue({ id: "request-1" });
    await expect(
      new TimeSheetService().sign({
        organization_id: "org-1",
        timesheet_id: "sheet-1",
        signer_user_id: "user-1",
        signature: "assinatura",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    prismaMock.timeClockRequest.findFirst.mockResolvedValue(null);
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      organization_id: "org-1",
      start_time: new Date("1970-01-01T08:00:00.000Z"),
      lunch_break: new Date("1970-01-01T12:00:00.000Z"),
      lunch_return: new Date("1970-01-01T13:00:00.000Z"),
      end_time: new Date("1970-01-01T17:00:00.000Z"),
      work_days: "1,2,3,4,5",
      bank_balance: 30,
      signature: "data:image/png;base64,c2lnbmF0dXJl",
    });
    prismaMock.timeBankReleases.findMany.mockResolvedValue([{ id: "release-1", minutes: 45 }]);
    prismaMock.timeBankReleases.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.timeSheets.update.mockResolvedValue({
      id: "sheet-1",
      signature: "data:image/png;base64,c2lnbmF0dXJl",
      status: "Assinada",
    });

    await new TimeSheetService().sign({
      organization_id: "org-1",
      timesheet_id: "sheet-1",
      signer_user_id: "user-1",
    });
    expect(prismaMock.pointsConfig.update).toHaveBeenCalledWith({
      where: { user_id: "user-1" },
      data: { bank_balance: { increment: 45 } },
    });
    expect(prismaMock.timeSheets.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signature: "data:image/png;base64,c2lnbmF0dXJl",
          totals: expect.objectContaining({ bank_balance_minutes: 75 }),
        }),
      }),
    );
  });
});

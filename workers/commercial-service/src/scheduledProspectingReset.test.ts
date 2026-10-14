import { describe, expect, it, vi } from "vitest";

import {
  getSaoPauloCalendarDate,
  ScheduledProspectingResetService,
} from "./scheduledProspectingReset.js";

const PROSPECTING_ID = "c0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const USER_ID = "d0000000-0000-4000-8000-000000000001";
const DUE_DATE = new Date("2026-10-13T00:00:00.000Z");

function createPrismaMock(resetDate = DUE_DATE) {
  const row = {
    id: PROSPECTING_ID,
    organization_id: ORGANIZATION_ID,
    client_id: CLIENT_ID,
    status: "Paralisado",
    status_date: new Date("2026-10-01T12:00:00.000Z"),
    description: null,
    reset_date: resetDate,
    reset_scheduled_by: USER_ID,
    reset_processed_at: null as Date | null,
    archived_at: null,
  };
  const prisma = {
    commercialProspecting: {
      findFirst: vi.fn(async () => (row.reset_processed_at ? null : { ...row })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (row.reset_processed_at || where.reset_date !== row.reset_date) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
    },
    commercialProspectingHistory: { create: vi.fn(async () => ({})) },
    commercialOutboxEvent: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return { prisma, row };
}

describe("ScheduledProspectingResetService", () => {
  it("calcula o dia corrente no fuso de São Paulo, inclusive antes da meia-noite UTC", () => {
    expect(getSaoPauloCalendarDate(new Date("2026-10-14T01:30:00.000Z"))).toBe("2026-10-13");
    expect(getSaoPauloCalendarDate(new Date("2026-10-14T03:00:00.000Z"))).toBe("2026-10-14");
  });

  it("processa uma data vencida uma vez e registra status e evento auditável", async () => {
    const { prisma, row } = createPrismaMock(new Date("2026-10-10T00:00:00.000Z"));
    const service = new ScheduledProspectingResetService(prisma as never, {
      now: () => new Date("2026-10-14T01:30:00.000Z"),
    });

    await expect(service.processNext()).resolves.toBe(true);

    expect(row.status).toBe("Análise/Agendamento");
    expect(row.reset_processed_at).toEqual(new Date("2026-10-14T01:30:00.000Z"));
    expect(prisma.commercialProspectingHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: ORGANIZATION_ID,
          prospecting_id: PROSPECTING_ID,
          changed_by: USER_ID,
          field: "status",
          old_value: "Paralisado",
          new_value: "Análise/Agendamento",
        }),
      }),
    );
    expect(prisma.commercialOutboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            scheduled_reset: true,
            to_status: "Análise/Agendamento",
          }),
        }),
      }),
    );
    await expect(service.processNext()).resolves.toBe(false);
    expect(prisma.commercialOutboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it("não processa a data de amanhã ainda no dia anterior em São Paulo", async () => {
    const { prisma } = createPrismaMock(new Date("2026-10-14T00:00:00.000Z"));
    const service = new ScheduledProspectingResetService(prisma as never, {
      now: () => new Date("2026-10-14T01:30:00.000Z"),
    });
    vi.mocked(prisma.commercialProspecting.findFirst).mockResolvedValue(null);

    await expect(service.processNext()).resolves.toBe(false);
    expect(prisma.commercialProspecting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reset_date: { lte: new Date("2026-10-13T00:00:00.000Z") },
        }),
      }),
    );
    expect(prisma.commercialProspecting.updateMany).not.toHaveBeenCalled();
  });

  it("serializa execuções concorrentes e só cria um evento", async () => {
    const { prisma } = createPrismaMock();
    const service = new ScheduledProspectingResetService(prisma as never, {
      now: () => new Date("2026-10-14T12:00:00.000Z"),
    });

    await Promise.all([service.processNext(), service.processNext()]);

    expect(prisma.commercialProspecting.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.commercialOutboxEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.commercialProspectingHistory.create).toHaveBeenCalledTimes(1);
  });
});

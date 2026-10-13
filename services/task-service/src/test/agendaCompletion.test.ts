import { describe, expect, it, vi } from "vitest";

import { AgendaService } from "../services/agendaService.js";

const organizationId = "org-1";
const clientId = "client-1";
const participants = ["user-1", "user-2", "user-3", "user-4"];
const scope = { organizationId, userId: "editor-1", module: "integracao", level: 2 } as const;
const completedAt = new Date("2026-10-13T12:00:00.000Z");

function setup() {
  const event = {
    agenda: "Reunião de Integração",
    date: new Date("2026-10-12T14:00:00.000Z"),
    status: "Pendente",
    client_id: clientId,
    participant_id: participants[0],
    participant_id_2: participants[1],
    participant_id_3: participants[2],
    participant_id_4: participants[3],
    department_control_id: "dep-1",
    department_id_2: "dep-1",
    department_id_3: "dep-1",
    department_id_4: "dep-1",
    agenda_id: "agenda-1",
    obs: null,
    location: null,
    recurring_agenda_id: null,
    recurrence_month: null,
  };
  const prisma = {
    department: { findMany: vi.fn().mockResolvedValue([{ id: "dep-1", name: "Integração" }]) },
    agenda: {
      findFirst: vi.fn(async () => ({ ...event })),
      updateMany: vi.fn(async ({ data }) => {
        if (data.status) event.status = data.status;
        return { count: 1 };
      }),
    },
    pA: { findFirst: vi.fn().mockResolvedValue({ client_id: clientId }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ timezone: "UTC" }) },
    user: { findMany: vi.fn().mockResolvedValue(participants.map((id) => ({ id }))) },
    clientHistory: { findMany: vi.fn().mockResolvedValue([]) },
    clientHistoryPending: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const audit = { logUpdateIfChanged: vi.fn() };
  const service = new AgendaService(prisma as never, audit as never);
  return { event, prisma, service };
}

describe("conclusão de compromisso de Integração (#1953)", () => {
  it("permite concluir um compromisso legado sem estado", async () => {
    const { event, prisma, service } = setup();
    event.status = null as never;
    prisma.agenda.updateMany.mockImplementationOnce(async ({ where, data }) => {
      if (!where.OR?.some((condition: { status: null }) => condition.status === null)) {
        return { count: 0 };
      }
      event.status = data.status;
      return { count: 1 };
    });

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);

    expect(prisma.agenda.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ status: null }, { status: { not: "Realizado" } }],
      }),
      data: expect.objectContaining({ status: "Realizado" }),
    });
    expect(prisma.clientHistoryPending.createMany).toHaveBeenCalledTimes(1);
  });

  it("cria pendência de histórico do PA para os quatro participantes elegíveis", async () => {
    const { prisma, service } = setup();

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);

    expect(prisma.pA.findFirst).toHaveBeenCalledWith({
      where: { client_id: clientId, organization_id: organizationId },
      select: { client_id: true },
    });
    expect(prisma.clientHistoryPending.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining(
        participants.map((userId) =>
          expect.objectContaining({
            user_id: userId,
            client_id: clientId,
            organization_id: organizationId,
          }),
        ),
      ),
      skipDuplicates: true,
    });
    expect(prisma.clientHistoryPending.createMany.mock.calls[0][0].data).toHaveLength(4);
  });

  it("não cria pendência sem PA nem repete ao salvar novamente um realizado", async () => {
    const { prisma, service } = setup();
    prisma.pA.findFirst.mockResolvedValueOnce(null);

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);
    expect(prisma.pA.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.clientHistoryPending.createMany).not.toHaveBeenCalled();

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);
    expect(prisma.pA.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.clientHistoryPending.createMany).not.toHaveBeenCalled();
  });

  it("não cria pendência para quem já registrou histórico do PA no mesmo dia", async () => {
    const { prisma, service } = setup();
    prisma.clientHistory.findMany.mockResolvedValue([{ user_id: participants[3] }]);

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);

    expect(prisma.clientHistory.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        user_id: { in: participants },
        date: {
          gte: new Date("2026-10-13T00:00:00.000Z"),
          lt: new Date("2026-10-14T00:00:00.000Z"),
        },
      },
      select: { user_id: true },
    });
    const data = prisma.clientHistoryPending.createMany.mock.calls[0][0].data;
    expect(data.map((pending: { user_id: string }) => pending.user_id)).toEqual(
      participants.slice(0, 3),
    );
  });

  it("usa o dia civil da organização mesmo quando a conclusão cruza a meia-noite UTC", async () => {
    const { prisma, service } = setup();
    prisma.organization.findFirst.mockResolvedValue({ timezone: "America/Sao_Paulo" });
    prisma.clientHistory.findMany.mockResolvedValue([{ user_id: participants[3] }]);

    await service.update(
      scope,
      "agenda-1",
      { status: "Realizado" },
      new Date("2026-10-14T01:00:00.000Z"),
    );

    expect(prisma.clientHistory.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        date: {
          gte: new Date("2026-10-13T03:00:00.000Z"),
          lt: new Date("2026-10-14T03:00:00.000Z"),
        },
      }),
      select: { user_id: true },
    });
    expect(prisma.clientHistoryPending.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ reason: "Registrar histórico do PA em 13/10/2026" }),
      select: { user_id: true },
    });
    expect(prisma.clientHistoryPending.createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it("respeita a duração do dia civil na mudança de horário de verão", async () => {
    const { prisma, service } = setup();
    prisma.organization.findFirst.mockResolvedValue({ timezone: "America/New_York" });

    await service.update(
      scope,
      "agenda-1",
      { status: "Realizado" },
      new Date("2026-03-08T18:00:00.000Z"),
    );

    expect(prisma.clientHistory.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        date: {
          gte: new Date("2026-03-08T05:00:00.000Z"),
          lt: new Date("2026-03-09T04:00:00.000Z"),
        },
      }),
      select: { user_id: true },
    });
  });

  it("usa a mesma chave de pendência em conclusões do mesmo participante e dia", async () => {
    const { event, prisma, service } = setup();

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);
    const firstIds = prisma.clientHistoryPending.createMany.mock.calls[0][0].data.map(
      (pending: { id: string }) => pending.id,
    );
    event.status = "Pendente";
    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);
    const secondIds = prisma.clientHistoryPending.createMany.mock.calls[1][0].data.map(
      (pending: { id: string }) => pending.id,
    );

    expect(secondIds).toEqual(firstIds);
  });

  it("não repete pendência de PA já aberta para um participante no mesmo dia", async () => {
    const { prisma, service } = setup();
    prisma.clientHistoryPending.findMany.mockResolvedValue([{ user_id: participants[1] }]);

    await service.update(scope, "agenda-1", { status: "Realizado" }, completedAt);

    const data = prisma.clientHistoryPending.createMany.mock.calls[0][0].data;
    expect(data.map((pending: { user_id: string }) => pending.user_id)).toEqual([
      participants[0],
      participants[2],
      participants[3],
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, pointServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    organization: {
      findUnique: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    timeSheets: {
      findFirst: vi.fn(),
    },
    point: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    timeClockRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    pointsConfig: {
      update: vi.fn(),
    },
  },
  pointServiceMock: {
    calculateDailyHours: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));
vi.mock("../services/pointService.js", () => ({
  PointService: vi.fn(function PointService() {
    return pointServiceMock;
  }),
}));

import { TimeClockRequestService } from "../services/timeClockRequestService.js";

describe("TimeClockRequestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findUnique.mockResolvedValue({ timezone: "UTC" });
    prismaMock.timeClockRequest.findFirst.mockResolvedValue(null);
    prismaMock.timeSheets.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({ department_id: "department-1" });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  const pointTimes = {
    clock_in: new Date("2026-09-15T08:00:00.000Z"),
    lunch_out: new Date("2026-09-15T12:00:00.000Z"),
    lunch_in: new Date("2026-09-15T13:00:00.000Z"),
    clock_out: new Date("2026-09-15T17:00:00.000Z"),
  };

  function requestSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      id: "req-1",
      user_id: "user-2",
      point_id: "point-1",
      ...pointTimes,
      justification: "Ajuste",
      attachment: null,
      date: new Date("2026-09-15T00:00:00.000Z"),
      status: "Pendente",
      approver_user_id: null,
      obs_approver: null,
      organization_id: "org-1",
      ...overrides,
    };
  }

  it("create lanca 404 quando ponto nao existe", async () => {
    prismaMock.point.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(
      service.create({
        user_id: "user-1",
        organization_id: "org-1",
        point_id: "point-1",
        ...pointTimes,
        justification: "Ajuste",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create permite solicitar ajuste para dia sem registro", async () => {
    const created = requestSnapshot({ point_id: null });
    prismaMock.timeClockRequest.create.mockResolvedValue(created);
    const service = new TimeClockRequestService();

    const result = await service.create({
      user_id: "user-2",
      organization_id: "org-1",
      date: new Date("2026-09-15T12:00:00.000Z"),
      ...pointTimes,
      justification: "Dia sem registro",
    });

    expect(result).toEqual(created);
    expect(prismaMock.timeClockRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          point_id: null,
          date: new Date("2026-09-15T00:00:00.000Z"),
          status: "Pendente",
        }),
      }),
    );
  });

  it("create bloqueia apenas outra solicitacao pendente do mesmo dia", async () => {
    prismaMock.timeClockRequest.findFirst.mockResolvedValue({ id: "req-pendente" });
    const service = new TimeClockRequestService();

    await expect(
      service.create({
        user_id: "user-2",
        organization_id: "org-1",
        ...pointTimes,
        justification: "Ajuste duplicado",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("approve lanca 404 quando solicitacao nao existe", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue(null);
    const service = new TimeClockRequestService();
    await expect(
      service.approve({
        request_id: "req-1",
        approver_user_id: "user-2",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("approve rejeita a decisao do proprio solicitante", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user_id: "user-2",
      organization_id: "org-1",
      status: "Pendente",
      point_id: "point-1",
    });
    const service = new TimeClockRequestService();

    await expect(
      service.approve({
        request_id: "req-1",
        approver_user_id: "user-2",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("approve cria o ponto ausente e calcula dentro da mesma transacao", async () => {
    const request = requestSnapshot({ point_id: null });
    const approved = requestSnapshot({ point_id: "point-created", status: "Aprovado" });
    prismaMock.timeClockRequest.findUnique
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(approved);
    prismaMock.point.create.mockResolvedValue({
      id: "point-created",
      user_id: "user-2",
      organization_id: "org-1",
      time_bank_balance: null,
    });
    prismaMock.timeClockRequest.updateMany.mockResolvedValue({ count: 1 });
    pointServiceMock.calculateDailyHours.mockResolvedValue({
      point_id: "point-created",
      total_worked_minutes: 480,
      expected_minutes: 480,
      day_balance_minutes: 0,
    });
    const service = new TimeClockRequestService();

    await service.approve({
      request_id: "req-1",
      approver_user_id: "user-3",
      organization_id: "org-1",
      rh_permission: 3,
    });

    expect(prismaMock.point.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user_id: "user-2", organization_id: "org-1" }),
      }),
    );
    expect(prismaMock.timeClockRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Aprovado", point_id: "point-created" }),
      }),
    );
    expect(pointServiceMock.calculateDailyHours).toHaveBeenCalledWith(
      "point-created",
      "org-1",
      prismaMock,
      "UTC",
    );
  });

  it("approve limita gestor ao departamento do colaborador", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue(requestSnapshot());
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ department_id: "department-1" })
      .mockResolvedValueOnce({ department_id: "department-2" });
    const service = new TimeClockRequestService();

    await expect(
      service.approve({
        request_id: "req-1",
        approver_user_id: "manager-1",
        organization_id: "org-1",
        rh_permission: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.point.update).not.toHaveBeenCalled();
    expect(pointServiceMock.calculateDailyHours).not.toHaveBeenCalled();
  });

  it("approve atualiza o ponto existente com os horarios da solicitacao", async () => {
    const request = requestSnapshot({
      point_id: "point-1",
      clock_in: new Date("2026-09-15T09:00:00.000Z"),
      lunch_out: new Date("2026-09-15T12:00:00.000Z"),
      lunch_in: new Date("2026-09-15T13:00:00.000Z"),
      clock_out: new Date("2026-09-15T18:00:00.000Z"),
    });
    const approved = requestSnapshot({ status: "Aprovado" });
    prismaMock.timeClockRequest.findUnique
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(approved);
    prismaMock.point.findUnique.mockResolvedValue({
      id: "point-1",
      user_id: "user-2",
      organization_id: "org-1",
      time_bank_balance: 30,
    });
    prismaMock.timeClockRequest.updateMany.mockResolvedValue({ count: 1 });
    const service = new TimeClockRequestService();

    await service.approve({
      request_id: "req-1",
      approver_user_id: "user-3",
      organization_id: "org-1",
      rh_permission: 3,
    });

    expect(prismaMock.point.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "point-1" },
        data: expect.objectContaining({
          clock_in: request.clock_in,
          lunch_out: request.lunch_out,
          lunch_in: request.lunch_in,
          clock_out: request.clock_out,
          workload_hours: null,
          time_bank_balance: null,
        }),
      }),
    );
    expect(pointServiceMock.calculateDailyHours).toHaveBeenCalledWith(
      "point-1",
      "org-1",
      prismaMock,
      "UTC",
    );
  });

  it("approveBulk aprova solicitacoes pendentes e recalcula cada ponto", async () => {
    const firstRequest = requestSnapshot({ id: "req-1", point_id: null });
    const secondRequest = requestSnapshot({ id: "req-2", point_id: null });
    const firstApproved = requestSnapshot({
      id: "req-1",
      point_id: "point-1",
      status: "Aprovado",
    });
    const secondApproved = requestSnapshot({
      id: "req-2",
      point_id: "point-2",
      status: "Aprovado",
    });
    prismaMock.timeClockRequest.findUnique
      .mockResolvedValueOnce(firstRequest)
      .mockResolvedValueOnce(firstApproved)
      .mockResolvedValueOnce(secondRequest)
      .mockResolvedValueOnce(secondApproved);
    prismaMock.point.create
      .mockResolvedValueOnce({
        id: "point-1",
        user_id: "user-2",
        organization_id: "org-1",
        time_bank_balance: null,
      })
      .mockResolvedValueOnce({
        id: "point-2",
        user_id: "user-2",
        organization_id: "org-1",
        time_bank_balance: null,
      });
    prismaMock.timeClockRequest.updateMany.mockResolvedValue({ count: 1 });
    pointServiceMock.calculateDailyHours.mockResolvedValue({
      point_id: "point-1",
      total_worked_minutes: 480,
      expected_minutes: 480,
      day_balance_minutes: 0,
    });
    const service = new TimeClockRequestService();

    await expect(
      service.approveBulk({
        request_ids: ["req-1", "req-2"],
        approver_user_id: "user-3",
        organization_id: "org-1",
        rh_permission: 3,
      }),
    ).resolves.toEqual([firstApproved, secondApproved]);

    expect(prismaMock.timeClockRequest.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.timeClockRequest.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "Aprovado", point_id: "point-1" }),
      }),
    );
    expect(prismaMock.timeClockRequest.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: "Aprovado", point_id: "point-2" }),
      }),
    );
    expect(pointServiceMock.calculateDailyHours).toHaveBeenCalledTimes(2);
  });

  it("approve bloqueia ponto de folha assinada", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue(requestSnapshot());
    prismaMock.timeSheets.findFirst.mockResolvedValue({ id: "sheet-1" });
    const service = new TimeClockRequestService();

    await expect(
      service.approve({
        request_id: "req-1",
        approver_user_id: "user-3",
        organization_id: "org-1",
        rh_permission: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.point.update).not.toHaveBeenCalled();
    expect(pointServiceMock.calculateDailyHours).not.toHaveBeenCalled();
  });

  it("createRetroactive cria ponto e solicitaçao aprovada na mesma transacao", async () => {
    const created = requestSnapshot({
      id: "retro-request",
      point_id: "retro-point",
      status: "Aprovado",
      user_id: "user-2",
    });
    prismaMock.point.findFirst.mockResolvedValue(null);
    prismaMock.point.create.mockResolvedValue({
      id: "retro-point",
      user_id: "user-2",
      organization_id: "org-1",
      time_bank_balance: null,
    });
    prismaMock.timeClockRequest.create.mockResolvedValue({ id: "retro-request" });
    prismaMock.timeClockRequest.findUniqueOrThrow.mockResolvedValue(created);
    const service = new TimeClockRequestService();

    await expect(
      service.createRetroactive({
        target_user_id: "user-2",
        organization_id: "org-1",
        date: new Date("2026-09-15T12:00:00.000Z"),
        ...pointTimes,
        justification: "Lancamento retroativo autorizado",
        approver_user_id: "user-3",
      }),
    ).resolves.toEqual(created);

    expect(prismaMock.point.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.timeClockRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Aprovado", approver_user_id: "user-3" }),
      }),
    );
    expect(pointServiceMock.calculateDailyHours).toHaveBeenCalledWith(
      "retro-point",
      "org-1",
      prismaMock,
      "UTC",
    );
  });

  it("reject marca a solicitacao como rejeitada sem alterar o ponto", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user_id: "user-2",
      organization_id: "org-1",
      status: "Pendente",
      point_id: "point-1",
    });
    prismaMock.timeClockRequest.updateMany.mockResolvedValue({ count: 1 });
    const service = new TimeClockRequestService();

    await service.reject({
      request_id: "req-1",
      approver_user_id: "user-3",
      organization_id: "org-1",
      obs_approver: "  Motivo da rejeicao  ",
    });

    expect(prismaMock.timeClockRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1", organization_id: "org-1", status: "Pendente" },
        data: {
          status: "Rejeitado",
          approver_user_id: "user-3",
          obs_approver: "Motivo da rejeicao",
        },
      }),
    );
    expect(prismaMock.point.update).not.toHaveBeenCalled();
    expect(prismaMock.pointsConfig.update).not.toHaveBeenCalled();
    expect(pointServiceMock.calculateDailyHours).not.toHaveBeenCalled();
  });

  it("reject rejeita solicitacao de outra organizacao", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user_id: "user-2",
      organization_id: "org-2",
      status: "Pendente",
      point_id: "point-1",
    });
    const service = new TimeClockRequestService();

    await expect(
      service.reject({
        request_id: "req-1",
        approver_user_id: "user-3",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reject rejeita solicitacao que nao esta pendente", async () => {
    prismaMock.timeClockRequest.findUnique.mockResolvedValue({
      id: "req-1",
      user_id: "user-2",
      organization_id: "org-1",
      status: "Aprovado",
      point_id: "point-1",
    });
    const service = new TimeClockRequestService();

    await expect(
      service.reject({
        request_id: "req-1",
        approver_user_id: "user-3",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("list filtra por status", async () => {
    prismaMock.timeClockRequest.findMany.mockResolvedValue([]);
    const service = new TimeClockRequestService();

    await service.list("org-1", { status: "Pendente" });

    expect(prismaMock.timeClockRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          status: "Pendente",
        }),
      }),
    );
  });

  it("list aceita o status Rejeitado", async () => {
    prismaMock.timeClockRequest.findMany.mockResolvedValue([]);
    const service = new TimeClockRequestService();

    await service.list("org-1", { status: "Rejeitado" });

    expect(prismaMock.timeClockRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "Rejeitado" }),
      }),
    );
  });

  it("list filtra por user_id", async () => {
    prismaMock.timeClockRequest.findMany.mockResolvedValue([]);
    const service = new TimeClockRequestService();

    await service.list("org-1", { user_id: "user-1" });

    expect(prismaMock.timeClockRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          user_id: "user-1",
        }),
      }),
    );
  });

  it("approveBulk impede ids repetidos antes da transacao", async () => {
    const service = new TimeClockRequestService();

    await expect(
      service.approveBulk({
        request_ids: ["req-1", "req-1"],
        approver_user_id: "user-3",
        organization_id: "org-1",
        rh_permission: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

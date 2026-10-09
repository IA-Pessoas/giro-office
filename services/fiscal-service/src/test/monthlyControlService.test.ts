import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MonthlyControlService } from "../services/monthlyControlService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientA = "d0000000-0000-4000-8000-000000000001";
const clientB = "d0000000-0000-4000-8000-000000000002";
const controlId = "f0000000-0000-4000-8000-000000000001";
const competence = new Date("2026-08-01T00:00:00.000Z");

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: controlId,
    organization_id: organizationId,
    client_id: clientA,
    competence,
    status: "PENDING",
    no_movement: false,
    regime: "Simples Nacional",
    opening_reason: null as string | null,
    created_by: userId,
    updated_by: userId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies() {
  const control = {
    findMany: vi.fn(async () => [] as ReturnType<typeof stored>[]),
    findFirst: vi.fn(async () => null as ReturnType<typeof stored> | null),
    createManyAndReturn: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row, index) => ({ id: `generated-${index}`, client_id: row.client_id })),
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => stored(data)),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const event = { createMany: vi.fn(async () => ({ count: 1 })) };
  const prisma = {
    client: {
      findMany: vi.fn(async () => [] as Array<Record<string, unknown>>),
      findFirst: vi.fn(async () => null as Record<string, unknown> | null),
      count: vi.fn(async () => 1),
    },
    fiscalMonthlyControl: control,
    fiscalMonthlyControlEvent: event,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ fiscalMonthlyControl: control, fiscalMonthlyControlEvent: event }),
    ),
  };
  const audit = { createLog: vi.fn(async () => {}) };
  const now = () => new Date("2026-09-15T12:00:00.000Z");
  return { prisma, audit, service: new MonthlyControlService(prisma as never, audit, now) };
}

const actor = { organizationId, userId, permission: 2 };

describe("MonthlyControlService.list", () => {
  it("gera só os controles que faltam para os clientes Fiscal elegíveis e registra a criação", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany
      .mockResolvedValueOnce([
        { id: clientA, regime: "Simples Nacional" },
        { id: clientB, regime: null },
      ])
      .mockResolvedValueOnce([
        { id: clientA, name: "Beta", company_name: null },
        { id: clientB, name: "x", company_name: "Alfa Ltda" },
      ]);
    prisma.fiscalMonthlyControl.findMany
      .mockResolvedValueOnce([stored()])
      .mockResolvedValueOnce([stored(), stored({ id: "generated-0", client_id: clientB })]);

    const result = await service.list({ competence: "2026-08" }, actor);

    expect(prisma.client.findMany).toHaveBeenNthCalledWith(1, {
      select: { id: true, regime: true },
      where: {
        organization_id: organizationId,
        fiscal: true,
        AND: [
          {
            OR: [
              { competence_entry: null },
              { competence_entry: { lte: new Date("2026-08-31T23:59:59.999Z") } },
            ],
          },
          {
            OR: [{ competence_output: null }, { competence_output: { gte: competence } }],
          },
        ],
      },
    });
    expect(prisma.fiscalMonthlyControl.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          client_id: clientB,
          competence,
          status: "PENDING",
          regime: null,
          created_by: userId,
          updated_by: userId,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          control_id: "generated-0",
          action: "CREATED",
          from_value: null,
          to_value: "PENDING",
          reason: null,
          actor_id: userId,
        },
      ],
    });
    expect(result.competence).toBe("2026-08");
    expect(result.items.map((item) => item.client_name)).toEqual(["Alfa Ltda", "Beta"]);
    expect(result.items[1]).toMatchObject({
      id: controlId,
      competence: "2026-08",
      status: "PENDING",
      no_movement: false,
      regime: "Simples Nacional",
    });
  });

  it("não escreve nada quando todos os elegíveis já têm controle", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientA, regime: null }]);
    prisma.fiscalMonthlyControl.findMany.mockResolvedValue([stored()]);

    await service.list({ competence: "2026-08" }, actor);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.fiscalMonthlyControl.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("não gera controles além do mês seguinte ao corrente", async () => {
    const { prisma, service } = dependencies();

    await service.list({ competence: "2026-11" }, actor);
    await service.list({ competence: "2026-10" }, actor);

    expect(prisma.client.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, regime: true } }),
    );
  });

  it("sob concorrência registra criação só para as linhas que este processo inseriu", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientA, regime: null }]);
    prisma.fiscalMonthlyControl.createManyAndReturn.mockResolvedValueOnce([]);

    await service.list({ competence: "2026-08" }, actor);

    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });
});

describe("MonthlyControlService.open", () => {
  it("abre fora da elegibilidade só com motivo e guarda o motivo no controle e na trilha", async () => {
    const { prisma, audit, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: "Lucro Presumido",
    });
    prisma.client.count.mockResolvedValue(0);

    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const result = await service.open({
      ...actor,
      client_id: clientA,
      competence: "2026-08",
      reason: "Cliente pediu apuração avulsa",
    });

    expect(result.created).toBe(true);
    expect(prisma.fiscalMonthlyControl.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        client_id: clientA,
        competence,
        status: "PENDING",
        regime: "Lucro Presumido",
        opening_reason: "Cliente pediu apuração avulsa",
        created_by: userId,
        updated_by: userId,
      },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          control_id: controlId,
          action: "EXCEPTIONAL_OPENING",
          to_value: "PENDING",
          reason: "Cliente pediu apuração avulsa",
          actor_id: userId,
        }),
      ],
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ referring: "fiscal.monthly_controls", referringId: controlId }),
    );
  });

  it("cliente sem Fiscal ativo na competência (consulta com a mesma regra da geração) exige motivo", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
    });
    prisma.client.count.mockResolvedValue(0);

    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("devolve o controle existente sem duplicar", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
      fiscal: true,
      competence_entry: null,
      competence_output: null,
    });
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored());

    const result = await service.open({ ...actor, client_id: clientA, competence: "2026-08" });

    expect(result.created).toBe(false);
    expect(prisma.fiscalMonthlyControl.create).not.toHaveBeenCalled();
  });

  it("corrida na criação devolve o controle que venceu", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findFirst.mockResolvedValue({
      id: clientA,
      regime: null,
      fiscal: true,
      competence_entry: null,
      competence_output: null,
    });
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored());
    prisma.fiscalMonthlyControl.create.mockRejectedValueOnce({ code: "P2002" });

    const result = await service.open({ ...actor, client_id: clientA, competence: "2026-08" });

    expect(result).toMatchObject({ created: false, control: { id: controlId } });
  });

  it("cliente de outra organização é 404", async () => {
    const { service } = dependencies();
    await expect(
      service.open({ ...actor, client_id: clientA, competence: "2026-08", reason: "teste" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MonthlyControlService.update", () => {
  it("muda situação e movimento com trilha de cada campo e checagem otimista", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst
      .mockResolvedValueOnce(stored())
      .mockResolvedValueOnce(stored({ status: "IN_PROGRESS", no_movement: true }));

    const result = await service.update({
      ...actor,
      id: controlId,
      status: "IN_PROGRESS",
      no_movement: true,
    });

    expect(prisma.fiscalMonthlyControl.updateMany).toHaveBeenCalledWith({
      where: {
        id: controlId,
        organization_id: organizationId,
        status: "PENDING",
        no_movement: false,
      },
      data: { status: "IN_PROGRESS", no_movement: true, updated_by: userId },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "STATUS",
          from_value: "PENDING",
          to_value: "IN_PROGRESS",
        }),
        expect.objectContaining({ action: "NO_MOVEMENT", from_value: "false", to_value: "true" }),
      ],
    });
    expect(result).toMatchObject({ status: "IN_PROGRESS", no_movement: true });
  });

  it("alteração concorrente vira 409 em vez de sobrescrever", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValueOnce(stored());
    prisma.fiscalMonthlyControl.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update({ ...actor, id: controlId, status: "COMPLETED" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });

  it("reabrir controle concluído exige Fiscal nível 3 e motivo", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "COMPLETED" }));

    await expect(
      service.update({ ...actor, id: controlId, status: "IN_PROGRESS", reason: "Erro" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.update({ ...actor, permission: 3, id: controlId, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.update({
      ...actor,
      permission: 3,
      id: controlId,
      status: "IN_PROGRESS",
      reason: "Retificação da DCTFWeb",
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "REOPENED",
          from_value: "COMPLETED",
          to_value: "IN_PROGRESS",
          reason: "Retificação da DCTFWeb",
        }),
      ],
    });
  });

  it("controle concluído não muda o movimento sem reabrir", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(stored({ status: "COMPLETED" }));

    await expect(
      service.update({ ...actor, permission: 3, id: controlId, no_movement: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyControl.updateMany).not.toHaveBeenCalled();
  });

  it("controle de outra organização é 404", async () => {
    const { service } = dependencies();
    await expect(
      service.update({ ...actor, id: controlId, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

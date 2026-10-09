import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { AnnualControlService } from "../services/annualControlService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientA = "d0000000-0000-4000-8000-000000000001";
const clientB = "d0000000-0000-4000-8000-000000000002";
const controlId = "f0000000-0000-4000-8000-000000000001";
const responsible = "e0000000-0000-4000-8000-00000000000a";
const actor = { organizationId, userId, permission: 2 };

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: controlId,
    organization_id: organizationId,
    client_id: clientA,
    year: 2025,
    regime: "Simples Nacional",
    responsible_id: responsible as string | null,
    created_by: userId,
    updated_by: userId,
    createdAt: new Date("2026-01-10T12:00:00.000Z"),
    updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "i0000000-0000-4000-8000-000000000001",
    control_id: controlId,
    code: "DEFIS",
    origin: "SUGGESTED",
    applicable: true,
    not_applicable_reason: null as string | null,
    completed_on: null as Date | null,
    completed_by: null as string | null,
    protocol: null as string | null,
    updatedAt: new Date("2026-02-10T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies() {
  const control = {
    findMany: vi.fn(async () => [] as ReturnType<typeof stored>[]),
    findFirst: vi.fn(async () => stored() as ReturnType<typeof stored> | null),
    createManyAndReturn: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row, index) => ({ id: `generated-${index}`, regime: row.regime })),
    ),
  };
  const items = {
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [] as ReturnType<typeof item>[]),
    findFirst: vi.fn(async () => item() as ReturnType<typeof item> | null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => item(data)),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const events = { createMany: vi.fn(async () => ({ count: 1 })) };
  const prisma = {
    client: {
      findMany: vi.fn(async () => [] as Array<Record<string, unknown>>),
    },
    triageResponsible: {
      findMany: vi.fn(async () => [] as Array<{ client_id: string; user_id: string }>),
    },
    user: { findMany: vi.fn(async () => [] as Array<{ id: string; name: string }>) },
    fiscalAnnualControl: control,
    fiscalAnnualControlItem: items,
    fiscalAnnualControlEvent: events,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        fiscalAnnualControl: control,
        fiscalAnnualControlItem: items,
        fiscalAnnualControlEvent: events,
      }),
    ),
  };
  const audit = { createLog: vi.fn(async () => {}) };
  const now = () => new Date("2026-03-15T12:00:00.000Z");
  return { prisma, audit, service: new AnnualControlService(prisma as never, audit, now) };
}

describe("AnnualControlService.list", () => {
  it("gera um controle por cliente com Fiscal no ano, com DEFIS só para o Simples e trilha", async () => {
    const { prisma, service } = dependencies();
    prisma.client.findMany
      .mockResolvedValueOnce([
        { id: clientA, regime: "Simples Nacional" },
        { id: clientB, regime: "Lucro Presumido" },
      ])
      .mockResolvedValueOnce([
        { id: clientA, name: "Alfa", company_name: null },
        { id: clientB, name: "Beta", company_name: null },
      ]);
    prisma.triageResponsible.findMany.mockResolvedValueOnce([
      { client_id: clientA, user_id: responsible },
    ]);
    prisma.fiscalAnnualControl.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      stored({ id: "generated-0" }),
      stored({
        id: "generated-1",
        client_id: clientB,
        regime: "Lucro Presumido",
        responsible_id: null,
      }),
    ]);
    prisma.fiscalAnnualControlItem.findMany.mockResolvedValueOnce([
      item({ control_id: "generated-0" }),
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: responsible, name: "Ana" }]);

    const result = await service.list({ year: 2025 }, actor);

    expect(prisma.client.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        organization_id: organizationId,
        fiscal: true,
        AND: [
          {
            OR: [
              { competence_entry: null },
              { competence_entry: { lte: new Date("2025-12-31T23:59:59.999Z") } },
            ],
          },
          {
            OR: [
              { competence_output: null },
              { competence_output: { gte: new Date("2025-01-01T00:00:00.000Z") } },
            ],
          },
        ],
      },
      select: { id: true, regime: true },
    });
    expect(prisma.fiscalAnnualControl.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          client_id: clientA,
          year: 2025,
          regime: "Simples Nacional",
          responsible_id: responsible,
          created_by: userId,
          updated_by: userId,
        },
        {
          organization_id: organizationId,
          client_id: clientB,
          year: 2025,
          regime: "Lucro Presumido",
          responsible_id: null,
          created_by: userId,
          updated_by: userId,
        },
      ],
      skipDuplicates: true,
      select: { id: true, regime: true },
    });
    expect(prisma.fiscalAnnualControlItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          organization_id: organizationId,
          control_id: "generated-0",
          code: "DEFIS",
          origin: "SUGGESTED",
        },
      ],
    });
    expect(prisma.fiscalAnnualControlEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ control_id: "generated-0", action: "CREATED" }),
        expect.objectContaining({ control_id: "generated-1", action: "CREATED" }),
        expect.objectContaining({
          control_id: "generated-0",
          action: "OBLIGATION_SUGGESTED",
          item_code: "DEFIS",
        }),
      ]),
    });
    expect(result.items[0]).toMatchObject({
      client_name: "Alfa",
      year: 2025,
      responsible_name: "Ana",
      declarations: [{ code: "DEFIS", status: "PENDING" }],
    });
    // Sem situação geral derivada: só o andamento por declaração.
    expect(result.items[0]).not.toHaveProperty("status");
    expect(result.items[1].declarations).toEqual([]);
  });

  it("não gera controles para ano futuro", async () => {
    const { prisma, service } = dependencies();
    await service.list({ year: 2027 }, actor);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("AnnualControlService itens", () => {
  it("lista declarações e oferece só as permitidas ao regime, sem DIRBI", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalAnnualControlItem.findMany.mockResolvedValueOnce([item()]);

    const result = await service.items(controlId, { ...actor, permission: 1 });

    expect(result.items[0]).toMatchObject({ code: "DEFIS", status: "PENDING" });
    expect(result.addable.map((entry) => entry.code)).toEqual(["DMED", "DIMOB", "DASN_SIMEI"]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("condicional entra só com motivo; DEFIS não entra no Lucro Presumido", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalAnnualControlItem.findFirst.mockResolvedValue(null);

    await expect(service.addItem(controlId, { code: "DMED" }, actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    await service.addItem(controlId, { code: "DMED", reason: "Clínica médica" }, actor);
    expect(prisma.fiscalAnnualControlItem.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        control_id: controlId,
        code: "DMED",
        origin: "MANUAL",
      },
    });
    expect(prisma.fiscalAnnualControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_ADDED",
          item_code: "DMED",
          reason: "Clínica médica",
        }),
      ],
    });

    prisma.fiscalAnnualControl.findFirst.mockResolvedValueOnce(
      stored({ regime: "Lucro Presumido" }),
    );
    await expect(
      service.addItem(controlId, { code: "DEFIS", reason: "teste" }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cumprir e dispensar seguem as regras comuns com trilha e checagem otimista", async () => {
    const { prisma, service } = dependencies();

    await expect(
      service.updateItem(controlId, "DEFIS", { applicable: false }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.updateItem(controlId, "DEFIS", { completed_on: "2026-03-16" }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.updateItem(
      controlId,
      "DEFIS",
      { completed_on: "2026-03-10", protocol: "REC-9" },
      actor,
    );
    expect(prisma.fiscalAnnualControlItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "i0000000-0000-4000-8000-000000000001",
        organization_id: organizationId,
        applicable: true,
        completed_on: null,
      },
      data: {
        completed_on: new Date("2026-03-10T00:00:00.000Z"),
        completed_by: userId,
        protocol: "REC-9",
      },
    });
    expect(prisma.fiscalAnnualControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_COMPLETED",
          item_code: "DEFIS",
          to_value: "2026-03-10",
          actor_id: userId,
        }),
      ],
    });

    prisma.fiscalAnnualControlItem.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.updateItem(controlId, "DEFIS", { applicable: false, reason: "Baixada" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("controle ou declaração de outra organização é 404", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalAnnualControl.findFirst.mockResolvedValueOnce(null);
    await expect(service.items(controlId, actor)).rejects.toMatchObject({ statusCode: 404 });
    prisma.fiscalAnnualControlItem.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateItem(controlId, "DIMOB", { completed_on: "2026-02-10" }, actor),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

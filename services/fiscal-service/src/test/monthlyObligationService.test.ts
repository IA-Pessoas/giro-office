import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MonthlyObligationService } from "../services/monthlyObligationService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const controlId = "f0000000-0000-4000-8000-000000000001";
const actor = { organizationId, userId, permission: 2 };

function control(overrides: Record<string, unknown> = {}) {
  return { id: controlId, status: "IN_PROGRESS", regime: "Simples Nacional", ...overrides };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "o0000000-0000-4000-8000-000000000001",
    control_id: controlId,
    code: "PGDAS_D",
    origin: "SUGGESTED",
    applicable: true,
    not_applicable_reason: null as string | null,
    completed_on: null as Date | null,
    completed_by: null as string | null,
    protocol: null as string | null,
    updatedAt: new Date("2026-09-10T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies() {
  const obligations = {
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [obligation()]),
    findFirst: vi.fn(async () => obligation() as ReturnType<typeof obligation> | null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => obligation(data)),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const event = { createMany: vi.fn(async () => ({ count: 1 })) };
  const prisma = {
    fiscalMonthlyControl: {
      findFirst: vi.fn(async () => control() as ReturnType<typeof control> | null),
    },
    fiscalMonthlyControlObligation: obligations,
    fiscalMonthlyControlEvent: event,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ fiscalMonthlyControlObligation: obligations, fiscalMonthlyControlEvent: event }),
    ),
  };
  const audit = { createLog: vi.fn(async () => {}) };
  const now = () => new Date("2026-09-15T12:00:00.000Z");
  return { prisma, audit, service: new MonthlyObligationService(prisma as never, audit, now) };
}

describe("MonthlyObligationService.list", () => {
  it("lista sem gravar nada e oferece só o que o regime permite incluir", async () => {
    const { prisma, service } = dependencies();

    const result = await service.list(controlId, actor);

    expect(prisma.fiscalMonthlyControl.findFirst).toHaveBeenCalledWith({
      where: { id: controlId, organization_id: organizationId },
      select: { id: true, status: true, regime: true },
    });
    expect(prisma.fiscalMonthlyControlObligation.createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      code: "PGDAS_D",
      name: "PGDAS-D",
      status: "PENDING",
      source: expect.stringContaining("gov.br"),
    });
    // Optante do Simples é dispensada da DIRBI: nem aparece para inclusão.
    expect(result.addable.map((item) => item.code)).toEqual(["DCTFWEB", "EFD_CONTRIBUICOES"]);
  });

  it("controle de outra organização é 404", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValueOnce(null);
    await expect(service.list(controlId, actor)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MonthlyObligationService.add", () => {
  it("DIRBI não entra em controle do Simples nem com motivo", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValue(null);
    await expect(
      service.add(controlId, { code: "DIRBI", reason: "Benefício" }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.fiscalMonthlyControlObligation.create).not.toHaveBeenCalled();
  });

  it("obrigação condicional só entra com motivo e fica na trilha", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValue(control({ regime: "Lucro Real" }));
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValue(null);

    await expect(service.add(controlId, { code: "DIRBI" }, actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    await service.add(
      controlId,
      { code: "DIRBI", reason: "Cliente com benefício do Perse" },
      actor,
    );

    expect(prisma.fiscalMonthlyControlObligation.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        control_id: controlId,
        code: "DIRBI",
        origin: "MANUAL",
      },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_ADDED",
          obligation_code: "DIRBI",
          reason: "Cliente com benefício do Perse",
          actor_id: userId,
        }),
      ],
    });
  });

  it("já incluída é 409", async () => {
    const { service } = dependencies();
    await expect(
      service.add(controlId, { code: "PGDAS_D", reason: "teste" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("MonthlyObligationService.update", () => {
  it("não aplicável exige motivo e grava motivo, ator e estado anterior", async () => {
    const { prisma, service } = dependencies();

    await expect(
      service.update(controlId, "PGDAS_D", { applicable: false }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.update(
      controlId,
      "PGDAS_D",
      { applicable: false, reason: "Empresa baixada no mês" },
      actor,
    );
    expect(prisma.fiscalMonthlyControlObligation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "o0000000-0000-4000-8000-000000000001",
        organization_id: organizationId,
        applicable: true,
        completed_on: null,
      },
      data: { applicable: false, not_applicable_reason: "Empresa baixada no mês" },
    });
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_NOT_APPLICABLE",
          obligation_code: "PGDAS_D",
          from_value: "applicable",
          to_value: "not_applicable",
          reason: "Empresa baixada no mês",
        }),
      ],
    });
  });

  it("cumprir registra data, ator e protocolo opcional; data futura é recusada", async () => {
    const { prisma, service } = dependencies();

    await expect(
      service.update(controlId, "PGDAS_D", { completed_on: "2026-09-16" }, actor),
    ).rejects.toMatchObject({ statusCode: 400 });

    await service.update(
      controlId,
      "PGDAS_D",
      { completed_on: "2026-09-15", protocol: "REC-123" },
      actor,
    );
    expect(prisma.fiscalMonthlyControlObligation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          completed_on: new Date("2026-09-15T00:00:00.000Z"),
          completed_by: userId,
          protocol: "REC-123",
        },
      }),
    );
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_COMPLETED",
          from_value: null,
          to_value: "2026-09-15",
        }),
      ],
    });
  });

  it("não cumpre obrigação não aplicável nem marca não aplicável a cumprida", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValueOnce(
      obligation({ applicable: false, not_applicable_reason: "x" }),
    );
    await expect(
      service.update(controlId, "PGDAS_D", { completed_on: "2026-09-10" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });

    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValueOnce(
      obligation({ completed_on: new Date("2026-09-10T00:00:00.000Z"), completed_by: userId }),
    );
    await expect(
      service.update(controlId, "PGDAS_D", { applicable: false, reason: "Dispensa" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("mudar só o protocolo mantém quem cumpriu", async () => {
    const { prisma, service } = dependencies();
    const original = "d0000000-0000-4000-8000-000000000009";
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValueOnce(
      obligation({
        completed_on: new Date("2026-09-10T00:00:00.000Z"),
        completed_by: original,
        protocol: "REC-1",
      }),
    );

    await service.update(
      controlId,
      "PGDAS_D",
      { completed_on: "2026-09-10", protocol: "REC-2" },
      actor,
    );

    expect(prisma.fiscalMonthlyControlObligation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          completed_on: new Date("2026-09-10T00:00:00.000Z"),
          completed_by: original,
          protocol: "REC-2",
        },
      }),
    );
  });

  it("desfazer cumprimento limpa data, ator e protocolo", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValueOnce(
      obligation({
        completed_on: new Date("2026-09-10T00:00:00.000Z"),
        completed_by: userId,
        protocol: "REC-1",
      }),
    );

    await service.update(
      controlId,
      "PGDAS_D",
      { completed_on: null, reason: "Recibo errado" },
      actor,
    );

    expect(prisma.fiscalMonthlyControlObligation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { completed_on: null, completed_by: null, protocol: null },
      }),
    );
    expect(prisma.fiscalMonthlyControlEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "OBLIGATION_UNDONE",
          from_value: "2026-09-10",
          to_value: null,
        }),
      ],
    });
  });

  it("controle concluído trava as obrigações e conflito vira 409", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControl.findFirst.mockResolvedValueOnce(control({ status: "COMPLETED" }));
    await expect(
      service.update(controlId, "PGDAS_D", { completed_on: "2026-09-10" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });

    prisma.fiscalMonthlyControlObligation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.update(controlId, "PGDAS_D", { completed_on: "2026-09-10" }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyControlEvent.createMany).not.toHaveBeenCalled();
  });

  it("obrigação que não está no controle é 404", async () => {
    const { prisma, service } = dependencies();
    prisma.fiscalMonthlyControlObligation.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.update(controlId, "DIRBI", { completed_on: "2026-09-10" }, actor),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
